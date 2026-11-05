/** Runtime guard: never enabled by a browser parameter or on the public deployment. */
export function supportEvaluationEnabled(env: { APP_ENV?: string; NEXTAUTH_URL?: string } = { APP_ENV: process.env.APP_ENV, NEXTAUTH_URL: process.env.NEXTAUTH_URL }): boolean {
  if (!['development', 'test'].includes(env.APP_ENV || '')) return false;
  try {
    const origin = new URL(env.NEXTAUTH_URL || '');
    return ['localhost', '127.0.0.1', '[::1]'].includes(origin.hostname);
  } catch { return false; }
}
export const EVAL_DAILY_BUDGET_CNY = 2;
export const EVAL_TTL_SECONDS = 24 * 60 * 60;
export const EVAL_MAX_TURNS = 20;
export const EVAL_REVISION = 'support-compare-20261105-v2';
