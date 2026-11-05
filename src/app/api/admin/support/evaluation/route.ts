import { z } from 'zod';
import { getAdminSession, hasAdminPermission } from '@/lib/admin-auth';
import { orderJson, OrderRequestError } from '@/lib/order-http';
import { readBoundedJson } from '@/lib/request-body';
import { rateLimit } from '@/lib/rate-limit';
import { getSupportConfig } from '@/lib/support/config';
import { supportEvaluationEnabled } from '@/lib/support/evaluation/access';
import { EVAL_SCENARIOS, EVAL_FIXTURE_VERSION, fixtureHistory, fixtureAuthenticated } from '@/lib/support/evaluation/fixtures';
import { EvaluationError, createEvaluation, evaluationDailyBudget, evaluationView, loadEvaluation, rateEvaluation, revealEvaluation, sendEvaluation } from '@/lib/support/evaluation/store';
export const dynamic = 'force-dynamic';
const id = z.string().uuid();
const schema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('create'), mode: z.enum(['prompt', 'full']), scenario: z.enum(EVAL_SCENARIOS.map(s => s.id) as [string, ...string[]]), budgetCny: z.union([z.literal(0.1), z.literal(0.5), z.literal(1), z.literal(2)]) }).strict(),
  z.object({ action: z.literal('send'), id, requestId: id, question: z.string().trim().min(1).max(2000) }).strict(),
  z.object({ action: z.literal('rate'), id, turnId: id, vote: z.enum(['A', 'B', 'tie', 'neither']) }).strict(),
  z.object({ action: z.literal('reveal'), id }).strict(),
]);
async function access() {
  if (!supportEvaluationEnabled()) return null;
  const admin = await getAdminSession();
  return admin && hasAdminPermission(admin, 'settings') ? admin : null;
}
function errorResponse(error: unknown) {
  if (error instanceof EvaluationError) return orderJson({ error: error.message, code: error.code }, error.status);
  if (error instanceof OrderRequestError) return orderJson({ error: error.message }, error.status);
  if (error instanceof z.ZodError || error instanceof SyntaxError) return orderJson({ error: '评测参数无效。' }, 400);
  return orderJson({ error: '评测暂不可用，请刷新查看已有结果；付费请求不会自动重试。' }, 503);
}
export async function GET(request: Request) {
  if (!supportEvaluationEnabled()) return orderJson({ error: '评测仅在本地环境开放。' }, 404);
  const admin = await access(); if (!admin) return orderJson({ error: '无权限' }, 403);
  try {
    const sessionId = new URL(request.url).searchParams.get('id');
    if (sessionId) return orderJson({ session: await evaluationView(await loadEvaluation(id.parse(sessionId), admin.id)), dailyBudget: await evaluationDailyBudget() });
    const config = await getSupportConfig();
    return orderJson({ model: config.model, wireApi: config.wireApi, configured: Boolean(config.apiKey), fixtureVersion: EVAL_FIXTURE_VERSION,
      scenarios: EVAL_SCENARIOS.map(s => ({ ...s, identity: fixtureAuthenticated(s.id) ? 'member' : 'guest', history: fixtureHistory(s.id) })), dailyBudget: await evaluationDailyBudget() });
  } catch (error) { return errorResponse(error); }
}
export async function POST(request: Request) {
  if (!supportEvaluationEnabled()) return orderJson({ error: '评测仅在本地环境开放。' }, 404);
  const admin = await access(); if (!admin) return orderJson({ error: '无权限' }, 403);
  try {
    if (request.headers.get('origin') !== new URL(process.env.NEXTAUTH_URL!).origin) return orderJson({ error: '请求来源无效' }, 403);
    if (!await rateLimit('support-evaluation', admin.id, 30, 60)) return orderJson({ error: '操作过于频繁，请稍后重试。' }, 429);
    const input = schema.parse(await readBoundedJson(request, 12000));
    const session = input.action === 'create' ? await createEvaluation(admin.id, input.mode, input.scenario, input.budgetCny)
      : input.action === 'send' ? await sendEvaluation(input.id, admin.id, input.requestId, input.question, request.signal)
      : input.action === 'rate' ? await rateEvaluation(input.id, admin.id, input.turnId, input.vote)
      : await revealEvaluation(input.id, admin.id);
    return orderJson({ session, dailyBudget: await evaluationDailyBudget() });
  } catch (error) { return errorResponse(error); }
}
