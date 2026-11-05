import { createHash, randomInt, randomUUID } from 'node:crypto';
import redis from '@/lib/redis';
import { SUPPORT_SCOPE_INSTRUCTIONS, SUPPORT_INSTRUCTIONS } from '../policy';
import { supportTools } from '../tools';
import { SUPPORT_LIMITS } from '../limits';
import { dayStartShanghai, getSupportConfig, redactSupportText, type SupportConfig } from '../config';
import { reservationCost, supportCost, supportRates } from '../budget';
import type { SupportCallRecord, SupportCallStart } from '../llm';
import { EVAL_DAILY_BUDGET_CNY, EVAL_MAX_TURNS, EVAL_REVISION, EVAL_TTL_SECONDS } from './access';
import { EVAL_FIXTURE_VERSION } from './fixtures';
import { historyForSide, runEvalSide } from './runner';
import type { EvalMode, EvalSession, EvalSessionView, EvalSide, EvalVote } from './types';

export class EvaluationError extends Error {
  constructor(message: string, public status = 400, public code?: string) { super(message); }
}
const prefix = 'support:eval:';
const stateKey = (id: string) => `${prefix}session:${id}`;
const budgetKey = (id: string) => `${prefix}budget:${id}`;
const pendingKey = (id: string) => `${prefix}pending:${id}`;
const units = (cny: number) => Math.ceil(cny * 100_000_000);
export function evaluationConfigHash(config: SupportConfig) {
  return createHash('sha256').update(JSON.stringify({ model: config.model, wireApi: config.wireApi, baseUrl: config.baseUrl, rates: supportRates(config), revision: EVAL_REVISION, fixture: EVAL_FIXTURE_VERSION, prompts: [SUPPORT_SCOPE_INSTRUCTIONS, SUPPORT_INSTRUCTIONS], tools: supportTools, limits: SUPPORT_LIMITS })).digest('hex');
}
export async function loadEvaluation(id: string, adminId: string): Promise<EvalSession> {
  const raw = await redis.get(stateKey(id));
  if (!raw) throw new EvaluationError('评测已过期，请新建对照。', 404);
  const session: EvalSession = JSON.parse(raw);
  if (session.adminId !== adminId || new Date(session.expiresAt).getTime() <= Date.now()) throw new EvaluationError('评测不存在或已过期。', 404);
  return session;
}
async function save(session: EvalSession) {
  const ttl = Math.ceil((new Date(session.expiresAt).getTime() - Date.now()) / 1000);
  if (ttl <= 0) throw new EvaluationError('评测已过期。', 410);
  await redis.set(stateKey(session.id), JSON.stringify(session), 'EX', ttl);
}
export async function evaluationView(session: EvalSession): Promise<EvalSessionView> {
  const [money, pending, config] = await Promise.all([redis.hgetall(budgetKey(session.id)), redis.exists(pendingKey(session.id)), getSupportConfig()]);
  const restartRequired = session.revision !== EVAL_REVISION || evaluationConfigHash(config) !== session.configHash;
  return { id: session.id, mode: session.mode, scenario: session.scenario, createdAt: session.createdAt, expiresAt: session.expiresAt,
    model: session.model, wireApi: session.wireApi, budgetCny: session.budgetCny, revealed: session.revealed, restartRequired,
    ...(session.revealed ? { versions: Object.fromEntries(Object.entries(session.assignment).map(([side, version]) => [side, version === 'baseline' ? '旧版 · d16f4fcc' : '新版 · 上下文优化版'])) as Record<EvalSide, string> } : {}),
    turns: session.turns, spentCny: Number(money.spent || 0) / 100_000_000, heldCny: Number(money.held || 0) / 100_000_000, pending: Boolean(pending) };
}
export async function createEvaluation(adminId: string, mode: EvalMode, scenario: string, budgetCny: number) {
  const config = await getSupportConfig(), id = randomUUID();
  const first = randomInt(2) === 0;
  const session: EvalSession = { id, adminId, mode, scenario, budgetCny, createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + EVAL_TTL_SECONDS * 1000).toISOString(), model: config.model, wireApi: config.wireApi,
    configHash: evaluationConfigHash(config), revision: EVAL_REVISION,
    assignment: { A: first ? 'baseline' : 'current', B: first ? 'current' : 'baseline' }, revealed: false, turns: [] };
  await save(session);
  return evaluationView(session);
}
async function withLock<T>(id: string, fn: (token: string, key: string) => Promise<T>): Promise<T> {
  const key = `${prefix}lock:${id}`, token = randomUUID();
  if (!await redis.set(key, token, 'EX', 120, 'NX')) throw new EvaluationError('本评测正在处理，请等待完成。', 409);
  try { return await fn(token, key); }
  finally { await redis.eval("if redis.call('GET',KEYS[1])==ARGV[1] then return redis.call('DEL',KEYS[1]) end return 0", 1, key, token); }
}
const reserveScript = `
local amount=tonumber(ARGV[2])
for i=1,2 do
 local used=tonumber(redis.call('HGET',KEYS[i],'spent') or '0')+tonumber(redis.call('HGET',KEYS[i],'held') or '0')
 if used+amount>tonumber(ARGV[i+2]) then return 0 end
end
for i=1,2 do
 redis.call('HSET',KEYS[i],ARGV[1],amount)
 redis.call('HINCRBY',KEYS[i],'held',amount)
 redis.call('EXPIRE',KEYS[i],259200)
end
return 1`;
const settleScript = `
local held=redis.call('HGET',KEYS[1],ARGV[1])
if not held then return 0 end
if ARGV[2]=='unknown' then return 1 end
for i=1,2 do
 local prior=redis.call('HGET',KEYS[i],ARGV[1])
 if not prior then return redis.error_reply('EVALUATION_LEDGER_MISSING') end
end
for i=1,2 do
 redis.call('HDEL',KEYS[i],ARGV[1])
 redis.call('HINCRBY',KEYS[i],'held',-tonumber(held))
 redis.call('HINCRBY',KEYS[i],'spent',tonumber(ARGV[2]))
end
return 1`;
export function evaluationLedger(session: Pick<EvalSession, 'id' | 'budgetCny'>, config: SupportConfig) {
  const reservations = new Map<string, string[]>();
  return {
    reserve: async (start: SupportCallStart) => {
      const amount = reservationCost(start, config).toNumber(), callId = randomUUID();
      const keys = [budgetKey(session.id), `${prefix}daily:${dayStartShanghai().toISOString().slice(0, 10)}`];
      const accepted = await redis.eval(reserveScript, 2, ...keys, callId, units(amount), units(session.budgetCny), units(EVAL_DAILY_BUDGET_CNY));
      if (!accepted) return false as const;
      reservations.set(callId, keys);
      return { callId, amountCny: amount };
    },
    settle: async (record: SupportCallRecord) => {
      const keys = reservations.get(record.callId || '');
      if (!keys) throw new EvaluationError('评测费用记录缺失，已停止后续调用。', 503);
      const amount = record.sent === false ? 0 : supportCost(record.usage, supportRates(config))?.mul(config.usdCnyRate).toNumber() ?? null;
      await redis.eval(settleScript, 2, ...keys, record.callId!, amount === null ? 'unknown' : units(amount));
    },
  };
}
export async function sendEvaluation(id: string, adminId: string, requestId: string, rawQuestion: string, signal?: AbortSignal) {
  return withLock(id, async (token, key) => {
    const session = await loadEvaluation(id, adminId), question = redactSupportText(rawQuestion.trim());
    const replay = session.turns.find(turn => turn.id === requestId);
    if (replay) {
      if (replay.question !== question) throw new EvaluationError('请求编号已用于另一个问题。', 409);
      return evaluationView(session);
    }
    if (await redis.exists(pendingKey(id))) throw new EvaluationError('上次请求未完成，请刷新查看；若进程已中断请新建评测，避免重复扣费。', 409);
    if (session.turns.length >= EVAL_MAX_TURNS) throw new EvaluationError('本次已达20轮，请新建对照。');
    if (session.mode === 'prompt' && session.turns.length && !session.turns.at(-1)?.vote) throw new EvaluationError('请先评价上一轮；提示词模式将沿用所选回答作为双方共同历史。');
    const config = await getSupportConfig();
    if (session.revision !== EVAL_REVISION || evaluationConfigHash(config) !== session.configHash) throw new EvaluationError('这组评测使用的是旧配置，请按当前配置新建对照。旧结果会保留，本次没有调用模型。', 409, 'EVAL_CONFIG_CHANGED');
    if (!config.apiKey) throw new EvaluationError('本地模型未配置，请在 .env 填写开发专用模型凭据后重启。', 503);
    // One evaluation pair per administrator, including across browser tabs.
    return withLock(`admin:${adminId}`, async () => {
      signal?.throwIfAborted();
      await redis.set(pendingKey(id), JSON.stringify({ requestId }), 'EX', EVAL_TTL_SECONDS);
      const ledger = evaluationLedger(session, config);
      const results = await Promise.all((['A', 'B'] as const).map(async side => runEvalSide({
        mode: session.mode, version: session.assignment[side], scenario: session.scenario, question,
        history: historyForSide(session, side), config, signal,
        reserve: async start => {
          if (await redis.get(key) !== token) throw new EvaluationError('评测锁已过期。', 409);
          return ledger.reserve(start);
        }, settle: ledger.settle,
      })));
      if (await redis.get(key) !== token) throw new EvaluationError('评测锁已过期，请新建评测。', 409);
      session.turns.push({ id: requestId, question, results: { A: results[0], B: results[1] } });
      await save(session);
      await redis.del(pendingKey(id));
      return evaluationView(session);
    });
  });
}
export async function rateEvaluation(id: string, adminId: string, turnId: string, vote: EvalVote) {
  return withLock(id, async () => {
    const session = await loadEvaluation(id, adminId), turn = session.turns.at(-1);
    if (!turn || turn.id !== turnId) throw new EvaluationError('只能评价最新一轮，已用于后续上下文的评价不可更改。', 409);
    turn.vote = vote; turn.ratedBlind = !session.revealed;
    await save(session); return evaluationView(session);
  });
}
export async function revealEvaluation(id: string, adminId: string) {
  return withLock(id, async () => {
    const session = await loadEvaluation(id, adminId);
    session.revealed = true; await save(session); return evaluationView(session);
  });
}
export async function evaluationDailyBudget() {
  const values = await redis.hgetall(`${prefix}daily:${dayStartShanghai().toISOString().slice(0, 10)}`);
  return { limitCny: EVAL_DAILY_BUDGET_CNY, spentCny: Number(values.spent || 0) / 100_000_000, heldCny: Number(values.held || 0) / 100_000_000 };
}
