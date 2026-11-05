/** Safety limits remain code controlled; selected quotas and retention windows are runtime settings. */
export const SUPPORT_LIMITS = {
  plannerMaxOutputTokens: 512,
  answerMaxOutputTokens: 1600,
  upstreamTimeoutMs: 25_000,
  totalTimeoutMs: 65_000,
  maxModelRounds: 4,
  maxToolCalls: 8,
  guestDailyModelTurns: 50,
  memberDailyModelTurns: 200,
  guestPerMinute: 5,
  memberPerMinute: 10,
  identityConcurrent: 1,
  ipConcurrent: 3,
  globalConcurrent: 8,
  ipDaily: 500,
  leaseMs: 120_000,
  circuitFailures: 3,
  circuitSeconds: 300,
  // Local token estimates include instructions, schemas, history and tool results.
  inputTargetTokens: 16_000,
  inputMaxTokens: 24_000,
  inputBytes: 131_072,
  toolReserveTokens: 4_000,
  recentTurns: 12,
  summaryTargetTokens: 2_000,
  summaryMaxTokens: 4_000,
  duplicateWindowSeconds: 60,
  duplicateThreshold: 4,
  cooldownSeconds: 15 * 60,
  violationWindowSeconds: 10 * 60,
  violationThreshold: 3,
  riskRetentionDays: 90,
} as const;

export function supportLimitSnapshot() {
  return { ...SUPPORT_LIMITS };
}
