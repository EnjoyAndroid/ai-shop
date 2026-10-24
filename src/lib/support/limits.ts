/** Fixed support limits are intentionally code controlled; they are not admin settings. */
export const SUPPORT_LIMITS = {
  plannerMaxOutputTokens: 256,
  answerMaxOutputTokens: 1000,
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
  inputBytes: 32_768,
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
