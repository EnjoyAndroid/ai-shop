import { Prisma } from '@prisma/client';
import prisma from '@/lib/db';
import { dayStartShanghai, type SupportConfig } from './config';
import { SUPPORT_LIMITS } from './limits';
import type { SupportCallRecord, SupportCallStart, SupportUsage } from './llm';

const decimal = (value: number | string) => new Prisma.Decimal(value);
const rounded = (value: Prisma.Decimal) => value.toDecimalPlaces(8, Prisma.Decimal.ROUND_UP);
export function supportRates(config: SupportConfig) {
  return { inputUsdPerMillion: config.inputUsdPerMillion, cachedInputUsdPerMillion: config.cachedInputUsdPerMillion,
    cacheWriteUsdPerMillion: config.cacheWriteUsdPerMillion, outputUsdPerMillion: config.outputUsdPerMillion, usdCnyRate: config.usdCnyRate };
}
export function supportCost(usage: SupportUsage, rates: ReturnType<typeof supportRates>): Prisma.Decimal | null {
  if (usage.inputTokens === null || usage.outputTokens === null) return null;
  const read = usage.cachedTokens || 0, write = usage.cacheWriteTokens || 0;
  if (read + write > usage.inputTokens || (usage.reasoningTokens || 0) > usage.outputTokens) return null;
  return rounded(decimal(usage.inputTokens - read - write).mul(rates.inputUsdPerMillion)
    .add(decimal(read).mul(rates.cachedInputUsdPerMillion)).add(decimal(write).mul(rates.cacheWriteUsdPerMillion))
    .add(decimal(usage.outputTokens).mul(rates.outputUsdPerMillion)).div(1_000_000));
}
export function reservationCost(start: SupportCallStart, config: SupportConfig) {
  // UTF-8 bytes + framing margin is a conservative local estimate, not reported usage.
  const bytes = Buffer.byteLength(JSON.stringify(start.body), 'utf8');
  if (bytes > SUPPORT_LIMITS.inputBytes) throw new Error('SUPPORT_INPUT_LIMIT');
  const inputRate = Math.max(config.inputUsdPerMillion, config.cachedInputUsdPerMillion, config.cacheWriteUsdPerMillion);
  return rounded(decimal(bytes + 2048).mul(inputRate).add(decimal(start.maxOutputTokens).mul(config.outputUsdPerMillion)).div(1_000_000).mul(config.usdCnyRate));
}
export async function currentSupportBudget(fallback: number, client: Pick<Prisma.TransactionClient, 'systemSetting'> = prisma) {
  // Read the budget directly: cache failure must not reopen a disabled model.
  const setting = await client.systemSetting.findUnique({ where: { key: 'supportDailyBudgetCny' }, select: { value: true } });
  const amount = setting ? Number(setting.value) : fallback;
  if (!Number.isFinite(amount) || amount < 0 || amount > 100000) throw new Error('INVALID_SUPPORT_BUDGET');
  return amount;
}
export async function reserveSupportCall(turnId: string, start: SupportCallStart, config: SupportConfig) {
  const day = dayStartShanghai();
  const amount = reservationCost(start, config);
  return prisma.$transaction(async tx => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`support-budget:${day.toISOString()}`}))`;
    const budget = await currentSupportBudget(config.dailyBudgetCny, tx);
    if (budget === 0) return false;
    // Legacy calls still count when upgrading mid-day. Never fabricate missing usage.
    const legacy = await tx.supportModelCall.aggregate({ where: { accountingState: 'LEGACY', createdAt: { gte: day, lt: new Date(day.getTime() + 86400000) } }, _sum: { estimatedCost: true } });
    const account = await tx.supportBudgetDay.upsert({ where: { day }, create: { day }, update: {} });
    const spent = account.reservedCny.add(account.settledCny).add(decimal(String(legacy._sum.estimatedCost || 0)).mul(config.usdCnyRate));
    if (spent.add(amount).gt(budget)) return false;
    const call = await tx.supportModelCall.create({ data: { turnId, provider: config.provider, requestModel: config.model,
      phase: start.phase === 'scope' ? 'planner' : 'answer', sequence: start.sequence, budgetDay: day,
      reservedCny: amount, rateSnapshot: supportRates(config), accountingState: 'PENDING', usageStatus: 'PENDING' } });
    await tx.supportBudgetDay.update({ where: { day }, data: { reservedCny: { increment: amount } } });
    await tx.supportTurn.update({ where: { id: turnId }, data: { modelTurn: true } });
    return { callId: call.id };
  });
}
export async function settleSupportCall(record: SupportCallRecord) {
  if (!record.callId) throw new Error('MISSING_CALL_RESERVATION');
  const initial = await prisma.supportModelCall.findUniqueOrThrow({ where: { id: record.callId } });
  if (!initial.budgetDay) throw new Error('MISSING_BUDGET_DAY');
  return prisma.$transaction(async tx => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`support-budget:${initial.budgetDay!.toISOString()}`}))`;
    const call = await tx.supportModelCall.findUniqueOrThrow({ where: { id: record.callId } });
    if (call.accountingState !== 'PENDING') return;
    const rates = call.rateSnapshot as ReturnType<typeof supportRates>;
    const cost = record.sent === false ? decimal(0) : supportCost(record.usage, rates);
    const cny = cost === null ? null : rounded(cost.mul(rates.usdCnyRate));
    await tx.supportModelCall.update({ where: { id: call.id }, data: { ...record.usage,
      estimatedCost: cost, settledCny: cny, accountingState: cny === null ? 'UNCERTAIN' : 'SETTLED',
      usageStatus: record.sent === false ? 'NOT_SENT' : cost === null ? 'MISSING' : 'COMPLETE',
      latencyMs: record.latencyMs, success: record.success, errorCode: record.errorCode || null } });
    if (cny !== null) await tx.supportBudgetDay.update({ where: { day: call.budgetDay! }, data: {
      reservedCny: { decrement: call.reservedCny }, settledCny: { increment: cny },
    } });
  });
}
