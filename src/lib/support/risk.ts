import { getSupportPolicy } from './policy-store';
import { createHash, randomUUID } from 'crypto';
import { Prisma } from '@prisma/client';
import prisma from '@/lib/db';
import redis from '@/lib/redis';
import { rateLimit } from '@/lib/rate-limit';
import type { ClientIpInfo } from '@/lib/get-client-ip';
import { dayStartShanghai } from './config';
import { SUPPORT_LIMITS as L } from './limits';

export interface RiskIdentity { userId?: string; anonymousKey: string; }
export const riskHash = (value: string) => createHash('sha256').update(value).digest('hex');
export const supportIdentityHash = (identity: RiskIdentity) => riskHash(identity.userId ? `user:${identity.userId}` : `guest:${identity.anonymousKey}`);
export class SupportRiskError extends Error {
  constructor(public code: string, message: string, public retryAfter: number) { super(message); }
}
const messages: Record<string, string> = {
  BLOCKED: '智能客服已暂时停用，请联系人工客服', COOLDOWN: '请求过于频繁，请稍后再试',
  RATE_LIMIT: '提问过于频繁，请稍后再试', DUPLICATE_SPAM: '检测到重复提问，请稍后再试',
  DAILY_LIMIT: '今日智能客服额度已用完，请明天再试', CONCURRENT: '客服当前请求较多，请稍后再试',
  CIRCUIT: '智能回答暂时不可用，可使用常见问题或联系人工客服',
};
export async function recordRisk(category: string, identity: RiskIdentity, ip: ClientIpInfo, details: Record<string, Prisma.InputJsonValue> = {}) {
  const hash = supportIdentityHash(identity);
  // Bound new audit rows under attack; coalesce repeated events in a minute.
  if (!await rateLimit('support-audit', 'global', 100, 60)) return;
  const bucket = `${Math.floor(Date.now()/60000)}:${hash}:${category}`;
  await prisma.supportRiskEvent.upsert({ where: { bucket }, create: { bucket, category, identityHash: hash,
    userId: identity.userId, clientIp: ip.trusted ? ip.value : null, details }, update: { count: { increment: 1 } } });
}
export async function checkSupportBlock(identity: RiskIdentity, ip: ClientIpInfo) {
  const hash = supportIdentityHash(identity);
  const block = await prisma.supportBlock.findFirst({ where: { revokedAt: null, expiresAt: { gt: new Date() }, OR: [
    { kind: 'identity', keyHash: hash }, ...(identity.userId ? [{ kind: 'user', keyHash: hash }] : []),
    ...(ip.trusted ? [{ kind: 'ip', keyHash: riskHash(ip.value) }] : []),
  ] } });
  if (block) throw new SupportRiskError('BLOCKED', messages.BLOCKED, Math.max(1, Math.ceil((block.expiresAt.getTime()-Date.now())/1000)));
}
// All admission counters and leases are changed atomically. Expired members,
// rather than expiring shared counters, prevent stale releases creating capacity.
const admitLua = `
local now = tonumber(ARGV[1]); local ttl = tonumber(ARGV[2]); local token = ARGV[3]
local untilMs = tonumber(redis.call('HGET', KEYS[10], 'until') or '0')
if untilMs > now then return {'CIRCUIT', math.ceil((untilMs-now)/1000)} end
local cooldown = redis.call('TTL', KEYS[8]); if cooldown > 0 then return {'COOLDOWN', cooldown} end
local minute = tonumber(redis.call('GET', KEYS[4]) or '0')
local duplicates = tonumber(redis.call('GET', KEYS[7]) or '0')
if minute >= tonumber(ARGV[4]) or duplicates >= tonumber(ARGV[7])-1 then
  local n = redis.call('INCR', KEYS[9]); if n == 1 then redis.call('EXPIRE', KEYS[9], ARGV[9]) end
  if duplicates >= tonumber(ARGV[7])-1 or n >= tonumber(ARGV[8]) then redis.call('SET', KEYS[8], '1', 'EX', ARGV[10]) end
  if duplicates >= tonumber(ARGV[7])-1 then return {'DUPLICATE_SPAM', ARGV[10]} end
  return {'RATE_LIMIT', 60}
end
if tonumber(redis.call('GET', KEYS[5]) or '0') >= tonumber(ARGV[5]) or tonumber(redis.call('GET', KEYS[6]) or '0') >= tonumber(ARGV[6]) then return {'DAILY_LIMIT', ARGV[11]} end
for i=1,3 do redis.call('ZREMRANGEBYSCORE', KEYS[i], '-inf', now) end
local cap = tonumber(ARGV[13]); if untilMs > 0 then cap = 1 end
if redis.call('ZCARD', KEYS[1]) >= 1 or redis.call('ZCARD', KEYS[2]) >= tonumber(ARGV[12]) or redis.call('ZCARD', KEYS[3]) >= cap then return {'CONCURRENT', 5} end
for i=1,3 do redis.call('ZADD', KEYS[i], now+ttl, token); redis.call('PEXPIRE', KEYS[i], ttl*2) end
for i=4,7 do
  local n = redis.call('INCR', KEYS[i]); if n == 1 then
    local expiry = 60; if i == 5 or i == 6 then expiry = tonumber(ARGV[11]) end
    redis.call('EXPIRE', KEYS[i], expiry)
  end
end
return {'OK', 0}
`;
export function riskKeys(identity: RiskIdentity, ip: ClientIpInfo, question: string, now = new Date()) {
  const hash = supportIdentityHash(identity), ipHash = riskHash(ip.trusted ? ip.value : 'unknown');
  const day = dayStartShanghai(now).toISOString();
  const normalized = question.normalize('NFKC').toLowerCase().replace(/[\u200b-\u200d\ufeff\s\p{P}]/gu, '');
  return [`support:v2:identity:${hash}`, `support:v2:ip:${ipHash}`, 'support:v2:global',
    `support:v2:minute:${hash}`, `support:v2:day:${day}:${hash}`, `support:v2:ipday:${day}:${ipHash}`,
    `support:v2:duplicate:${hash}:${riskHash(normalized)}`, `support:v2:cooldown:${hash}`, `support:v2:violations:${hash}`, 'support:v2:circuit'];
}
export async function acquireSupportPermit(identity: RiskIdentity, ip: ClientIpInfo, question: string, now = new Date()) {
  await checkSupportBlock(identity, ip);
  const config = await getSupportPolicy();
  const keys = riskKeys(identity, ip, question, now), token = randomUUID();
  const daySeconds = Math.max(1, Math.ceil((dayStartShanghai(now).getTime()+86400000-now.getTime())/1000));
  const result = await redis.eval(admitLua, keys.length, ...keys, now.getTime(), L.leaseMs, token,
    identity.userId ? (config.memberPerMinute ?? L.memberPerMinute) : (config.guestPerMinute ?? L.guestPerMinute), identity.userId ? (config.memberDailyModelTurns ?? L.memberDailyModelTurns) : (config.guestDailyModelTurns ?? L.guestDailyModelTurns),
    L.ipDaily, L.duplicateThreshold, L.violationThreshold, L.violationWindowSeconds, L.cooldownSeconds, daySeconds, L.ipConcurrent, L.globalConcurrent) as [string, number];
  if (result[0] !== 'OK') throw new SupportRiskError(result[0], messages[result[0]] || messages.RATE_LIMIT, Number(result[1]));
  let released = false;
  return async () => {
    if (released) return;
    released = true;
    await redis.eval("for i=1,3 do redis.call('ZREM', KEYS[i], ARGV[1]) end return 1", 3, ...keys.slice(0,3), token);
  };
}
export async function checkSupportCircuit() {
  const until = Number(await redis.hget('support:v2:circuit', 'until') || 0);
  if (until > Date.now()) throw new SupportRiskError('CIRCUIT', messages.CIRCUIT, Math.ceil((until-Date.now())/1000));
}
export async function recordModelOutcome(failed: boolean) {
  await redis.eval(`
    if ARGV[1]=='0' then redis.call('DEL', KEYS[1]); return 0 end
    local n=redis.call('HINCRBY', KEYS[1], 'failures', 1)
    if n>=tonumber(ARGV[2]) then redis.call('HSET', KEYS[1], 'until', ARGV[3]) end
    redis.call('EXPIRE', KEYS[1], ARGV[4]); return n`, 1, 'support:v2:circuit', failed ? 1 : 0,
    L.circuitFailures, Date.now()+L.circuitSeconds*1000, L.circuitSeconds*2);
}
