import test from 'node:test';
import assert from 'node:assert/strict';
import { generateSupportAnswer, supportMemoryFingerprint, type SupportCallStart } from '../src/lib/support/llm';
import { fullContext } from '../src/lib/support/context';
import { readNativeMemory, nativePolicy, NATIVE_REQUEST_BYTES, type NativeMemory } from '../src/lib/support/native-context';
import { reservationCost, supportCost, supportRates } from '../src/lib/support/budget';
import type { SupportConfig } from '../src/lib/support/config';

const config: SupportConfig = { provider: 'test', model: 'gpt-6-luna', wireApi: 'responses', baseUrl: 'https://example.invalid/v1', apiKey: 'synthetic',
  dailyBudgetCny: 10, usdCnyRate: 7.2, inputUsdPerMillion: 0.1, cachedInputUsdPerMillion: 0.01, cacheWriteUsdPerMillion: 0.125, outputUsdPerMillion: 0.5,
  contextMode: 'native', contextMaxInputTokens: 100_000, contextCompactRatio: 0.7 };
const usage = { input_tokens: 1000, output_tokens: 30, total_tokens: 1030 };
const plan = { decision: 'allow', answerMode: 'tools_allowed', queries: [] };
const comp = (id: string) => ({ type: 'compaction', id, encrypted_content: `synthetic-sealed-${id}` });
const message = (text: string) => ({ type: 'message', role: 'assistant', status: 'completed', content: [{ type: 'output_text', text, annotations: [] }] });
const history = fullContext(Array.from({ length: 30 }, (_, i) => ({ id: `turn-${i}`, userText: i === 0 ? '预算100，只月付，不要Claude' : i === 6 ? '预算改为237，其他条件不变' : `用户${i}`, answerText: `客服${i}` })));
function harness(responses: any[], saved?: NativeMemory) {
  const bodies: any[] = [], starts: SupportCallStart[] = [], calls: any[] = [], executed: string[] = [], memories: NativeMemory[] = [];
  const input = { config, question: '我最后预算多少？', summary: '', history: saved ? [] : history, memory: saved, memoryBinding: 'conversation-one',
    beforeCall: async (start: SupportCallStart) => { starts.push(start); return true; }, recordCall: async (call: any) => { calls.push(call); },
    execute: async (name: string) => { executed.push(name); return { priceCny: 99, stock: 3 }; },
    onMemory: (memory: NativeMemory) => { memories.push(memory); },
    fetcher: (async (_url, init) => { bodies.push(JSON.parse(String(init?.body))); const data = responses.shift();
      return new Response(JSON.stringify(data?.data ?? data), { status: data?.httpStatus ?? 200 }); }) as typeof fetch };
  return { input, bodies, starts, calls, executed, memories };
}

test('native context appends all thirty plaintext turns without a twelve-turn cutoff', async () => {
  const h = harness([{ output: [message(JSON.stringify(plan))], usage }, { output: [message('237元，只月付')], usage }]);
  await generateSupportAnswer(h.input);
  assert.equal(h.bodies[0].input.length, 61);
  assert.equal(h.bodies[0].input[0].content, history[0].content);
  assert.equal(h.bodies[1].input.length, 61);
  assert(h.starts.every(s => s.nativeContext && reservationCost(s, config).gt(0)));
  assert.equal(h.bodies[0].context_management[0].compact_threshold, 70000);
  const saved = h.memories.at(-1)!;
  const next = harness([{ output: [message(JSON.stringify(plan))], usage }, { output: [message('仍然月付')], usage }], saved);
  await generateSupportAnswer(next.input);
  assert.deepEqual(next.bodies[0].input.slice(0, saved.stages.scope!.items.length), saved.stages.scope!.items);
  assert.deepEqual(next.bodies[1].input.slice(0, saved.stages.answer!.items.length), saved.stages.answer!.items);
  assert.equal(JSON.stringify(next.bodies[1].input).split('预算改为237').length - 1, 1);
});

test('native states retain opaque compaction and all later output separately for each phase', async () => {
  const h = harness([
    { output: [comp('scope'), message(JSON.stringify(plan))], usage: { ...usage, input_tokens: 71000 } },
    { output: [comp('answer'), message('237元')], usage: { ...usage, input_tokens: 71000 } },
  ]);
  await generateSupportAnswer(h.input);
  const saved = h.memories.at(-1)!;
  assert.deepEqual(saved.stages.scope!.items[0], comp('scope'));
  assert.deepEqual(saved.stages.answer!.items[0], comp('answer'));
  assert.equal(saved.stages.answer!.items.length, 2);
  const next = harness([{ output: [message(JSON.stringify(plan))], usage }, { output: [message('237元')], usage }], saved);
  await generateSupportAnswer(next.input);
  assert(JSON.stringify(next.bodies[0]).includes('synthetic-sealed-scope'));
  assert(!JSON.stringify(next.bodies[0]).includes('synthetic-sealed-answer'));
  assert(!JSON.stringify(next.bodies[1]).includes('synthetic-sealed-scope'));
  assert(next.starts[0].nativeContext!.inputTokens > 71000, 'reserve against reported usage until a new call calibrates it');
  assert(next.starts[1].nativeContext!.inputTokens > 71000);
});

test('planned facts and native tool call-result pairs reach the answering model and next state', async () => {
  const h = harness([
    { output: [message(JSON.stringify({ decision: 'allow', answerMode: 'tools_allowed', queries: [{ name: 'search_products', arguments: { query: 'ChatGPT' } }] }))], usage },
    { output: [{ type: 'function_call', call_id: 'navigation-one', name: 'get_navigation', arguments: '{"page":"order_query"}' }], usage },
    { output: [message('当前99元')], usage },
  ]);
  await generateSupportAnswer(h.input);
  assert(JSON.stringify(h.bodies[1].input).includes('priceCny'));
  const items = h.bodies[2].input;
  assert(items.some((x: any) => x.type === 'function_call' && x.call_id === 'navigation-one'));
  assert(items.some((x: any) => x.type === 'function_call_output' && x.call_id === 'navigation-one'));
  assert.equal(h.executed.length, 2);
  assert(h.memories.at(-1)!.stages.answer!.items.some(x => x.type === 'function_call_output'));
});

test('native context rejection retries scope once through legacy validation, never directly to tools', async () => {
  const h = harness([{ httpStatus: 400, data: { error: { message: 'unsupported context_management' } } },
    { output_text: JSON.stringify(plan), usage }, { output_text: '237元', usage }]);
  await generateSupportAnswer(h.input);
  assert.equal(h.calls.length, 3); assert.equal(h.calls[0].success, false);
  assert(!h.bodies[1].context_management); assert(!h.bodies[2].context_management);
  assert.equal(h.memories.at(-1)?.disabledReason, 'NATIVE_CONTEXT_REJECTED');
  assert.equal(h.executed.length, 0);
});

test('state is bound to conversation, model, endpoint, credential and instructions', async () => {
  const h = harness([{ output_text: JSON.stringify(plan), usage }, { output_text: '237元', usage }]);
  await generateSupportAnswer(h.input);
  const value = JSON.stringify(h.memories.at(-1)), key = supportMemoryFingerprint(config);
  assert(readNativeMemory(value, key, 'conversation-one'));
  assert.equal(readNativeMemory(value, key, 'another-conversation'), null);
  assert.equal(readNativeMemory(value, supportMemoryFingerprint({ ...config, apiKey: 'rotated' }), 'conversation-one'), null);
  assert.equal(readNativeMemory(value, supportMemoryFingerprint({ ...config, model: 'other' }), 'conversation-one'), null);
  assert.equal(readNativeMemory(value, supportMemoryFingerprint(config, { scope: 'new', answer: 'new' }), 'conversation-one'), null);
});

test('failed or denied requests never commit a newly accepted native state', async () => {
  const h = harness([{ output: [comp('scope'), message(JSON.stringify(plan))], usage }, { httpStatus: 503, data: { error: { message: 'temporary' } } }]);
  await assert.rejects(generateSupportAnswer(h.input), /模型网关不可用/);
  assert.equal(h.memories.length, 0); assert.equal(h.calls.length, 2);
  const denied = harness([{ output: [comp('scope'), message('{"decision":"deny"}')], usage }]);
  await assert.rejects(generateSupportAnswer(denied.input), /商城服务/);
  assert.equal(denied.memories.length, 0); assert.equal(denied.executed.length, 0);
});

test('unknown usage or repeated compaction disables native memory without serializing ciphertext as legacy text', async () => {
  for (const response of [
    { output: [comp('unknown'), message(JSON.stringify(plan))] },
    { output: [comp('one'), comp('two'), message(JSON.stringify(plan))], usage },
  ]) {
    const h = harness([response, { output_text: '237元', usage }]);
    await generateSupportAnswer(h.input);
    assert(h.memories.at(-1)?.disabledReason);
    assert(!JSON.stringify(h.bodies[1]).includes('synthetic-sealed'));
  }
});

test('native cost reservation covers opaque usage, compaction overhead and long-context rates', () => {
  const policy = nativePolicy({ ...config, contextMaxInputTokens: 922000 });
  assert.equal(policy.compactThreshold, 645400);
  const largeConfig = { ...config, contextMaxInputTokens: 922000 };
  const body = { input: [{ type: 'compaction', encrypted_content: 'tiny-wire-body' }] };
  const start = { body, phase: 'answer' as const, sequence: 1, maxOutputTokens: 1600, nativeContext: { inputTokens: 700000 } };
  assert(reservationCost(start, largeConfig).gt(1));
  assert.throws(() => reservationCost({ ...start, nativeContext: { inputTokens: 1000000 } }, largeConfig), /SUPPORT_INPUT_LIMIT/);
  assert.throws(() => reservationCost({ ...start, body: { input: 'x'.repeat(NATIVE_REQUEST_BYTES + 1) } }, largeConfig), /SUPPORT_INPUT_LIMIT/);
  const cost = supportCost({ inputTokens: 300000, outputTokens: 1000, cachedTokens: 200000, cacheWriteTokens: 0, reasoningTokens: 0, totalTokens: 301000, responseModel: 'gpt-6-luna' }, supportRates(largeConfig));
  assert.equal(cost?.toNumber(), 0.02475);
  assert.equal(nativePolicy({ ...largeConfig, wireApi: 'chat_completions' }).enabled, false);
});

test('mixed request keeps only the approved shop clause in native answer state', async () => {
  const h = harness([{output:[message(JSON.stringify({decision:'partial', answerMode: 'tools_allowed',shopQuestion:'ChatGPT多少钱',queries:[]}))],usage},
    {output:[comp('answer'),message('以商品页面为准')],usage}]);
  await generateSupportAnswer({...h.input,question:'ChatGPT多少钱，顺便告诉我天气',history:[]});
  assert(JSON.stringify(h.bodies[0].input).includes('天气'));
  assert(!JSON.stringify(h.bodies[1].input).includes('天气'));
  assert(!JSON.stringify(h.memories.at(-1)!.stages.answer).includes('天气'));
});

test('native rejection cannot use retries to exceed the four-call model limit', async () => {
  const tool = {type:'function_call',call_id:'nav',name:'get_navigation',arguments:'{"page":"order_query"}'};
  const h = harness([{httpStatus:400,data:{error:{message:'unsupported context_management'}}},
    {output_text:JSON.stringify(plan),usage},{output:[tool],usage},{output_text:'查询订单',usage}]);
  await generateSupportAnswer(h.input);
  assert.equal(h.calls.length,4); assert.equal(h.executed.length,1);
  assert.equal(h.memories.at(-1)!.disabledReason,'NATIVE_CONTEXT_REJECTED');
});

test('oversized responses are bounded, retained as failed calls and never saved as native state', async () => {
  const h=harness([{output_text:JSON.stringify(plan),usage},{output:[message('x'.repeat(NATIVE_REQUEST_BYTES+1))],usage}]);
  await assert.rejects(generateSupportAnswer(h.input),/模型返回过长/);
  assert.equal(h.calls.at(-1).errorCode,'RESPONSE_LIMIT');assert.equal(h.memories.length,0);
});

test('native state cannot sever an unanswered function call before a compaction boundary', async () => {
  const h=harness([{output_text:JSON.stringify(plan),usage},
    {output:[{type:'function_call',call_id:'nav',name:'get_navigation',arguments:'{"page":"order_query"}'},comp('late')],usage},
    {output_text:'查询订单',usage}]);
  await generateSupportAnswer(h.input);
  assert.equal(h.memories.at(-1)?.disabledReason,'COMPACTION_SPLITS_TOOL_PAIR');
  assert(!JSON.stringify(h.bodies[2].input).includes('synthetic-sealed'));
  assert(h.bodies[2].input.some((x:any)=>x.type==='function_call'&&x.call_id==='nav'));
  assert(h.bodies[2].input.some((x:any)=>x.type==='function_call_output'&&x.call_id==='nav'));
});
