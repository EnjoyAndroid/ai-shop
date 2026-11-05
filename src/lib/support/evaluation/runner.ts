import { generateSupportAnswer, type SupportCallStart, type SupportCallRecord } from '../llm';
import { generateSupportAnswer as generateBaseline } from './baseline/llm';
import { SUPPORT_SCOPE_INSTRUCTIONS as baselineScope, SUPPORT_INSTRUCTIONS as baselineAnswer, isOutOfScopeSupportQuestion as baselineOutOfScope } from './baseline/policy';
import { recentContext as baselineHistory, nextContextSummary as baselineSummary } from './baseline/context';
import { recentContext, nextContextSummary } from '../context';
import { redactSupportText, type SupportConfig } from '../config';
import { supportCost, supportRates } from '../budget';
import { supportGreetingAnswer, isOutOfScopeSupportQuestion, SUPPORT_SCOPE_REFUSAL, SUPPORT_SCOPE_CLARIFICATION, SUPPORT_SCOPE_UNAVAILABLE, withSupportPartialNotice } from '../policy';
import { evaluationFailure } from './diagnostics';
import { buildSupportUi, cleanSupportAnswer, modelToolResult } from '../ui';
import { fixtureHistory, fixtureTool, fixtureAuthenticated } from './fixtures';
import type { EvalCall, EvalHistory, EvalMode, EvalResult, EvalSession, EvalSide, EvalVersion } from './types';

export function historyForSide(session: EvalSession, side: EvalSide): EvalHistory[] {
  const seed = fixtureHistory(session.scenario);
  return [...seed, ...session.turns.flatMap(turn => {
    const selected = session.mode === 'prompt' ? (turn.vote === 'B' ? 'B' : 'A') : side;
    const result = turn.results[selected];
    return ['COMPLETED', 'GREETING'].includes(result.status) ? [{ id: turn.id, userText: turn.question, answerText: result.answer }] : [];
  })];
}
export function evalMemory(history: EvalHistory[], legacy: boolean) {
  let summary = '';
  for (let n = 12; n < history.length; n++) {
    const window = history.slice(n - 12, n).reverse();
    summary = legacy ? baselineSummary(summary, window) : nextContextSummary(summary, window);
  }
  return { summary, history: legacy ? baselineHistory([...history].reverse()) : recentContext([...history].reverse()) };
}
export async function runEvalSide(input: {
  mode: EvalMode; version: EvalVersion; question: string; history: EvalHistory[]; scenario: string; config: SupportConfig;
  reserve: (start: SupportCallStart) => Promise<{ callId: string; amountCny: number } | false>;
  settle: (record: SupportCallRecord) => Promise<void>; signal?: AbortSignal; fetcher?: typeof fetch;
}): Promise<EvalResult> {
  const began = Date.now(), calls: EvalCall[] = [], tools: EvalResult['tools'] = [];
  const pending = new Map<string, number>();
  let requestedTools = 0, answer = '', status = 'COMPLETED', partialAccepted = false;
  const legacy = input.mode === 'full' && input.version === 'baseline';
  const memory = evalMemory(input.history, legacy);
  const underlyingFetch = input.fetcher || fetch;
  const fetcher: typeof fetch = async (url, options) => {
    const response = await underlyingFetch(url, options);
    const body = await response.clone().json().catch(() => ({}));
    requestedTools += body.choices?.[0]?.message?.tool_calls?.length || body.output?.filter((i: { type: string }) => i.type === 'function_call').length || 0;
    const text = body.output_text ?? body.choices?.[0]?.message?.content ?? body.output?.flatMap((i: any) => i.content || []).map((i: any) => i.text || '').join('');
    try { const plan = JSON.parse(text); if (['allow','partial'].includes(plan.decision) && Array.isArray(plan.queries)) requestedTools += plan.queries.length; } catch { /* ordinary answer */ }
    return response;
  };
  try {
    const greeting = supportGreetingAnswer(input.question);
    if (greeting) { answer = greeting; status = 'GREETING'; }
    else if ((legacy ? baselineOutOfScope : isOutOfScopeSupportQuestion)(input.question)) { answer = SUPPORT_SCOPE_REFUSAL; status = 'OUT_OF_SCOPE'; }
    else answer = await (legacy ? generateBaseline : generateSupportAnswer)({
      ...memory, question: input.question, config: input.config, signal: input.signal, fetcher,
      onPlan: (plan: {decision: string}) => { partialAccepted = plan.decision === 'partial'; },
      ...(input.mode === 'prompt' && input.version === 'baseline' ? { instructions: { scope: baselineScope, answer: baselineAnswer } } : {}),
      execute: async (name, args, signal) => { signal?.throwIfAborted(); const result = fixtureTool(input.scenario, name, args); tools.push({ name, arguments: args, result }); return modelToolResult(name, result); },
      beforeCall: async start => {
        const reserved = await input.reserve(start);
        if (!reserved) return false;
        pending.set(reserved.callId, reserved.amountCny);
        return { callId: reserved.callId };
      },
      recordCall: async record => {
        const amount = pending.get(record.callId || '') || 0;
        await input.settle(record);
        const cost = record.sent === false ? 0 : supportCost(record.usage, supportRates(input.config))?.mul(input.config.usdCnyRate).toNumber() ?? null;
        calls.push({ phase: record.phase, sequence: record.sequence, latencyMs: record.latencyMs, success: record.success,
          errorCode: record.errorCode, inputTokens: record.usage.inputTokens, outputTokens: record.usage.outputTokens,
          cachedTokens: record.usage.cachedTokens, responseModel: record.usage.responseModel, costCny: cost,
          reservedCny: cost === null ? amount : 0, requestedTools });
      },
    });
  } catch (error) {
    status = typeof (error as {code?: string})?.code === 'string' ? (error as {code: string}).code : 'ERROR';
    answer = status === 'OUT_OF_SCOPE' ? SUPPORT_SCOPE_REFUSAL : status === 'SCOPE_CLARIFY' ? SUPPORT_SCOPE_CLARIFICATION
      : status === 'SCOPE_UNAVAILABLE' ? SUPPORT_SCOPE_UNAVAILABLE : status === 'BUDGET' ? '评测预算不足，本侧未继续调用模型。'
      : status === 'CANCELLED' ? '本轮已停止，已发出的调用可能产生费用。' : '本侧未完成，请查看状态；不会自动重试付费请求。';
  }
  const diagnostic = evaluationFailure({ status, calls });
  if (diagnostic) answer = diagnostic.message;
  const sum = (key: 'inputTokens' | 'outputTokens' | 'costCny') => calls.some(c => c[key] === null) ? null : calls.reduce((n, c) => n + (c[key] || 0), 0);
  if (partialAccepted) answer = withSupportPartialNotice(answer);
  const rawAnswer = redactSupportText(answer);
  const authenticated = fixtureAuthenticated(input.scenario);
  const ui = buildSupportUi(tools.map(t => ({ tool: t.name, result: t.result })), rawAnswer, authenticated ? 'synthetic-member' : undefined);
  // Synthetic products deliberately have no real transaction URL. Preview only
  // returned, mentioned products, deduplicated by name; never infer from prose.
  const previews = new Map<string, {name:string;priceCny:number;stock:number;description:string}>();
  for (const tool of tools) if (tool.name === 'search_products') {
    const result = tool.result as any;
    if (result.error) continue;
    for (const product of [...(result.exactMatches || []), ...(result.relatedProducts || [])]) {
      if (rawAnswer.includes(product.name)) previews.set(product.name, { name: product.name, priceCny: product.priceCny, stock: product.stock, description: product.description });
    }
  }
  return { answer: cleanSupportAnswer(rawAnswer, ui), rawAnswer, ui, productPreviews: [...previews.values()], status, latencyMs: Date.now() - began, calls, tools,
    inputTokens: sum('inputTokens'), outputTokens: sum('outputTokens'), costCny: sum('costCny'),
    reservedCny: calls.reduce((n, c) => n + c.reservedCny, 0), modelCalls: calls.length, toolCalls: requestedTools, toolExecutions: tools.length };
}
