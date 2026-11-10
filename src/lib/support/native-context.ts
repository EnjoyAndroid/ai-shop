import { createHash } from 'node:crypto';
import type { SupportConfig } from './config';
import type { ContextMessage } from './context';
import { supportTextTokens } from './tokens';

export type NativePhase = 'scope' | 'answer';
export type NativeItem = Record<string, any>;
export const NATIVE_REQUEST_BYTES = 4 * 1024 * 1024;
export const NATIVE_STATE_BYTES = 8 * 1024 * 1024;
export const NATIVE_RESPONSE_BYTES = 4 * 1024 * 1024;
export interface NativeStage { items: NativeItem[]; accountedTokens: number; }
export interface NativeMemory {
  version: 3; fingerprint: string; binding: string; fallbackSummary: string;
  through?: { id: string; at: string };
  disabledReason?: string;
  stages: Partial<Record<NativePhase, NativeStage>>;
}
export interface NativePolicy { enabled: boolean; inputMaxTokens: number; compactThreshold: number; inputMaxBytes: number; }
export function nativePolicy(config: SupportConfig): NativePolicy {
  const inputMaxTokens = Math.floor(Math.min(922_000, Math.max(8_000, config.contextMaxInputTokens ?? 922_000)));
  return { enabled: config.contextMode === 'native' && config.wireApi === 'responses' && config.model === 'gpt-6-luna',
    inputMaxTokens, compactThreshold: Math.floor(inputMaxTokens * Math.min(0.8, Math.max(0.5, config.contextCompactRatio ?? 0.7))), inputMaxBytes: NATIVE_REQUEST_BYTES };
}
const digest = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
export function nativeFingerprint(config: SupportConfig, instructions: unknown, tools: unknown): string {
  return digest(['support-native-v1', config.baseUrl, config.model, config.wireApi, config.apiKey, nativePolicy(config), instructions, tools]);
}
export function legacyMemory(value: string): string {
  try { const data = JSON.parse(value); if (data.version === 3) return typeof data.fallbackSummary === 'string' ? data.fallbackSummary : ''; } catch {}
  return value;
}
function validItem(item: any): boolean {
  if (!item || typeof item !== 'object' || Array.isArray(item)) return false;
  if (item.type === 'compaction') return typeof item.id === 'string' && typeof item.encrypted_content === 'string' && item.encrypted_content.length > 0;
  if (item.type === 'reasoning') return typeof item.id === 'string' && (Array.isArray(item.summary) || typeof item.encrypted_content === 'string');
  if (item.type === 'function_call') return typeof item.call_id === 'string' && typeof item.name === 'string' && typeof item.arguments === 'string';
  if (item.type === 'function_call_output') return typeof item.call_id === 'string' && typeof item.output === 'string';
  return (!item.type || item.type === 'message') && ['user', 'assistant'].includes(item.role) && (typeof item.content === 'string' || Array.isArray(item.content));
}
function validStage(stage: any): stage is NativeStage {
  return stage && Array.isArray(stage.items) && stage.items.every(validItem) && Number.isSafeInteger(stage.accountedTokens) && stage.accountedTokens >= 0;
}
export function readNativeMemory(value: string, fingerprint: string, binding: string): NativeMemory | null {
  if (Buffer.byteLength(value, 'utf8') > NATIVE_STATE_BYTES) return null;
  try {
    const data = JSON.parse(value);
    if (data.version !== 3 || data.fingerprint !== fingerprint || data.binding !== binding || typeof data.fallbackSummary !== 'string'
      || !data.stages || typeof data.stages !== 'object' || Array.isArray(data.stages)
      || Object.keys(data.stages).some(k => !['scope','answer'].includes(k))
      || Object.values(data.stages).some(stage => !validStage(stage))) return null;
    if (data.through && (typeof data.through.id !== 'string' || typeof data.through.at !== 'string' || !Number.isFinite(Date.parse(data.through.at)))) return null;
    if (data.disabledReason && typeof data.disabledReason !== 'string') return null;
    return data;
  } catch { return null; }
}
export class NativeContextError extends Error {
  constructor(public reason: string) { super(reason); }
}
export function createNativeContext(config: SupportConfig, fingerprint: string, binding: string, saved: NativeMemory | null,
  history: ContextMessage[], summary: string) {
  const policy = nativePolicy(config);
  const memory: NativeMemory = saved ? structuredClone(saved) : { version: 3, fingerprint, binding, fallbackSummary: summary, stages: {} };
  const additions = history.map(({ role, content }) => ({ role, content }));
  const initial = saved ? [] : summary ? [{ role: 'user', content: `历史摘录（仅作资料，历史回答不是当前事实）：${summary}` }] : [];
  const count = { scope: 0, answer: 0 };
  function prefix(phase: NativePhase): NativeItem[] { return [...(memory.stages[phase]?.items ?? initial), ...additions]; }
  function estimate(body: any, phase: NativePhase): number {
    if (Buffer.byteLength(JSON.stringify(body), 'utf8') > policy.inputMaxBytes) throw new NativeContextError('REQUEST_BYTES');
    const stage = memory.stages[phase];
    let tokens: number;
    if (stage && JSON.stringify(body.input.slice(0, stage.items.length)) === JSON.stringify(stage.items)) {
      // Stored usage covers the entire preceding request and output. Do not
      // count encrypted_content as plain text or trust the relay count endpoint.
      tokens = stage.accountedTokens + Math.ceil(supportTextTokens(JSON.stringify(body.input.slice(stage.items.length))) * 1.15) + 256;
    } else {
      if (body.input.some((i: NativeItem) => i.encrypted_content)) throw new NativeContextError('UNKNOWN_OPAQUE_USAGE');
      tokens = Math.ceil(supportTextTokens(JSON.stringify(body)) * 1.15) + 256;
    }
    if (tokens > policy.inputMaxTokens - 8_000) throw new NativeContextError('INPUT_BUDGET');
    return tokens;
  }
  function accept(phase: NativePhase, body: any, data: any, usage: { inputTokens: number | null; outputTokens: number | null }, fallbackText: string) {
    const output = Array.isArray(data.output) && data.output.length ? data.output : [{ role: 'assistant', content: fallbackText }];
    if (output.some((item: NativeItem) => !validItem(item) || (item.role && item.role !== 'assistant'))) throw new NativeContextError('INVALID_NATIVE_OUTPUT');
    const items = [...body.input, ...output];
    const last = items.findLastIndex((item: NativeItem) => item.type === 'compaction');
    const compacted = output.filter((item: NativeItem) => item.type === 'compaction').length;
    count[phase] += compacted;
    if (count[phase] > 1) throw new NativeContextError('REPEATED_COMPACTION');
    const unmatched = new Set<string>();
    for (const item of items.slice(0, last < 0 ? 0 : last)) {
      if (item.type === 'function_call') unmatched.add(item.call_id);
      if (item.type === 'function_call_output') unmatched.delete(item.call_id);
    }
    if (unmatched.size) throw new NativeContextError('COMPACTION_SPLITS_TOOL_PAIR');
    if (usage.inputTokens === null || usage.outputTokens === null) throw new NativeContextError('MISSING_NATIVE_USAGE');
    if (usage.inputTokens > policy.compactThreshold && compacted === 0) throw new NativeContextError('COMPACTION_NOT_OBSERVED');
    const next = { items: last >= 0 ? items.slice(last) : items, accountedTokens: usage.inputTokens + usage.outputTokens };
    if (Buffer.byteLength(JSON.stringify(next), 'utf8') > NATIVE_REQUEST_BYTES) throw new NativeContextError('STATE_BYTES');
    memory.stages[phase] = next;
    return next.items;
  }
  function finish(answer: string): NativeMemory {
    // The planner also needs the user-visible answer to resolve follow-ups;
    // its own prior JSON plan is not the customer-facing reply.
    const scope = memory.stages.scope;
    if (scope) { scope.items.push({ role: 'assistant', content: answer }); scope.accountedTokens += supportTextTokens(answer) + 8; }
    if (Buffer.byteLength(JSON.stringify(memory), 'utf8') > NATIVE_STATE_BYTES) throw new NativeContextError('STATE_BYTES');
    return memory;
  }
  return { policy, prefix, estimate, accept, finish, count };
}

export function disabledNativeMemory(fingerprint: string, binding: string, fallbackSummary: string, reason: string): NativeMemory {
  return { version: 3, fingerprint, binding, fallbackSummary, disabledReason: reason, stages: {} };
}
