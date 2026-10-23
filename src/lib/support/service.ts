import { randomBytes } from "crypto";
import { cookies } from "next/headers";
import { Prisma } from "@prisma/client";
import { auth } from "@/lib/auth";
import prisma from "@/lib/db";
import { getSupportConfig, dayStartShanghai, redactSupportText, supportModelConfigured } from "./config";
import { factsToPrompt, getSupportFacts, searchSupportKnowledge, type SupportFacts, type SupportSource } from "./retriever";
import { generateSupportAnswer, SupportLlmError, type SupportUsage } from "./llm";

const ANON_COOKIE = "support_anon";
const CONVERSATION_DAYS = 30;

export interface SupportIdentity { userId?: string; anonymousKey: string; }

export async function getSupportIdentity(): Promise<SupportIdentity> {
  const cookieStore = await cookies();
  const current = cookieStore.get(ANON_COOKIE)?.value;
  const anonymousKey = current && /^[a-f0-9]{64}$/.test(current) ? current : randomBytes(32).toString("hex");
  if (!current) cookieStore.set(ANON_COOKIE, anonymousKey, { httpOnly: true, sameSite: "strict", secure: process.env.NODE_ENV === "production", maxAge: CONVERSATION_DAYS * 86400, path: "/" });
  const session = await auth();
  return { userId: typeof session?.user?.id === "string" ? session.user.id : undefined, anonymousKey };
}

function expiresAt(): Date { return new Date(Date.now() + CONVERSATION_DAYS * 86400 * 1000); }

export async function createSupportConversation(identity: SupportIdentity) {
  return prisma.supportConversation.create({ data: { userId: identity.userId, anonymousKey: identity.anonymousKey, expiresAt: expiresAt() }, select: { id: true, title: true, createdAt: true, turns: { orderBy: { createdAt: "asc" }, take: 20, select: { id: true, userText: true, answerText: true, createdAt: true, sources: true, facts: true } } } });
}

export async function getLatestSupportConversation(identity: SupportIdentity) {
  return prisma.supportConversation.findFirst({
    where: { expiresAt: { gt: new Date() }, ...(identity.userId ? { userId: identity.userId } : { anonymousKey: identity.anonymousKey }) },
    orderBy: { updatedAt: "desc" },
    select: { id: true, title: true, createdAt: true, turns: { orderBy: { createdAt: "asc" }, take: 20, select: { id: true, userText: true, answerText: true, createdAt: true } } },
  });
}

export async function getSupportConversation(id: string, identity: SupportIdentity) {
  return prisma.supportConversation.findFirst({ where: { id, expiresAt: { gt: new Date() }, ...(identity.userId ? { userId: identity.userId } : { anonymousKey: identity.anonymousKey }) }, select: { id: true, title: true, turns: { orderBy: { createdAt: "asc" }, take: 20, select: { id: true, userText: true, answerText: true, createdAt: true, sources: true, facts: true } } } });
}

export function fallbackAnswer(question: string, context: string, facts: SupportFacts): string {
  // Dynamic questions must be answered from current business facts before
  // returning broad article matches. Otherwise a stock question can surface
  // unrelated refund/payment articles when the LLM is intentionally disabled.
  if (/库存|有货|哪些商品|商品.*库存/.test(question)) return facts.products.length ? facts.products.map(product => `${product.name}：${product.stock > 0 ? `有货（${product.stock} 件）` : "暂时缺货"}，售价 ¥${product.priceCny.toFixed(2)}`).join("\n") : "当前暂未查询到商品信息，请稍后重试。";
  if (/支付|付款|充值/.test(question)) return facts.paymentMethods.length ? `当前可用支付方式：${facts.paymentMethods.join("、")}。实际以付款页面显示为准。` : "当前暂未查询到可用支付方式，请稍后重试或联系客服。";
  if (context) return `${context.split("\n")[0].replace(/^知识\d+《|》$/g, "") ? "根据帮助说明：\n" : ""}${context.split("\n").slice(1).join("\n").trim() || context}`;
  return "我暂时没有找到对应的帮助内容。你可以换一种说法，或点击联系客服获取人工帮助。";
}

function costUsd(usage: SupportUsage, config: Awaited<ReturnType<typeof getSupportConfig>>): number | null {
  if (usage.inputTokens === null || usage.outputTokens === null) return null;
  const cached = usage.cachedTokens || 0;
  const writes = usage.cacheWriteTokens || 0;
  const ordinary = Math.max(0, usage.inputTokens - cached - writes);
  return (ordinary * config.inputUsdPerMillion + cached * config.cachedInputUsdPerMillion + writes * config.cacheWriteUsdPerMillion + usage.outputTokens * config.outputUsdPerMillion) / 1_000_000;
}

async function budgetExceeded(): Promise<boolean> {
  const config = await getSupportConfig();
  const aggregate = await prisma.supportModelCall.aggregate({ where: { createdAt: { gte: dayStartShanghai() }, estimatedCost: { not: null } }, _sum: { estimatedCost: true } });
  return Number(aggregate._sum.estimatedCost || 0) * config.usdCnyRate >= config.dailyBudgetCny;
}

export async function answerSupportTurn(conversationId: string, requestId: string, question: string, identity: SupportIdentity) {
  const conversation = await getSupportConversation(conversationId, identity);
  if (!conversation) throw new Error("客服会话不存在或已过期");
  const existing = await prisma.supportTurn.findUnique({ where: { conversationId_requestId: { conversationId, requestId } }, select: { id: true, answerText: true, sources: true, facts: true, status: true } });
  if (existing) return { turnId: existing.id, answer: existing.answerText || "", sources: existing.sources || [], facts: existing.facts || {}, status: existing.status };
  const safeQuestion = redactSupportText(question.trim());
  const turn = await prisma.supportTurn.create({ data: { conversationId, requestId, userText: safeQuestion, status: "PROCESSING" } });
  const [{ sources, context }, facts] = await Promise.all([searchSupportKnowledge(safeQuestion), getSupportFacts(identity.userId)]);
  const history = conversation.turns.slice(-6).flatMap(turn => turn.answerText ? [{ role: "user" as const, content: turn.userText }, { role: "assistant" as const, content: turn.answerText }] : []);
  let answer = fallbackAnswer(safeQuestion, context, facts);
  let status = "FALLBACK";
  const config = await getSupportConfig();
  if (supportModelConfigured(config) && !(await budgetExceeded())) {
    const started = Date.now();
    try {
      const result = await generateSupportAnswer({ question: safeQuestion, history, knowledge: context, facts: factsToPrompt(facts) });
      answer = result.answer; status = "COMPLETED";
      const cost = costUsd(result.usage, result.config);
      await prisma.supportModelCall.create({ data: { turnId: turn.id, provider: result.config.provider, requestModel: result.config.model, responseModel: result.usage.responseModel, inputTokens: result.usage.inputTokens, cachedTokens: result.usage.cachedTokens, cacheWriteTokens: result.usage.cacheWriteTokens, outputTokens: result.usage.outputTokens, reasoningTokens: result.usage.reasoningTokens, totalTokens: result.usage.totalTokens, estimatedCost: cost, usageStatus: cost === null ? "MISSING" : "COMPLETE", latencyMs: result.latencyMs, success: true } });
    } catch (error) {
      status = error instanceof SupportLlmError ? `FALLBACK_${error.code}` : "FALLBACK_ERROR";
      await prisma.supportModelCall.create({ data: { turnId: turn.id, provider: config.provider, requestModel: config.model, usageStatus: "MISSING", latencyMs: Date.now() - started, success: false, errorCode: status } });
    }
  } else if (supportModelConfigured(config)) status = "FALLBACK_BUDGET";
  await prisma.supportTurn.update({ where: { id: turn.id }, data: { answerText: answer, status, sources: sources as any, facts: { paymentMethods: facts.paymentMethods, products: facts.products, orders: facts.orders }, conversation: { update: { updatedAt: new Date(), title: conversation.title || safeQuestion.slice(0, 40) } } } });
  return { turnId: turn.id, answer, sources, facts: { paymentMethods: facts.paymentMethods, products: facts.products, orders: facts.orders }, status };
}

export async function setSupportFeedback(turnId: string, value: number, identity: SupportIdentity): Promise<boolean> {
  const turn = await prisma.supportTurn.findFirst({ where: { id: turnId, conversation: { OR: [{ userId: identity.userId || "__anonymous__" }, { anonymousKey: identity.anonymousKey }] } } });
  if (!turn) return false;
  await prisma.supportTurn.update({ where: { id: turnId }, data: { feedback: value } });
  return true;
}

export async function supportUsageSummary() {
  const calls = await prisma.supportModelCall.findMany({ orderBy: { createdAt: "desc" }, take: 500, select: { createdAt: true, provider: true, requestModel: true, inputTokens: true, cachedTokens: true, cacheWriteTokens: true, outputTokens: true, reasoningTokens: true, totalTokens: true, estimatedCost: true, usageStatus: true, latencyMs: true, success: true } });
  const totals = calls.reduce((sum, call) => ({ input: sum.input + (call.inputTokens || 0), cached: sum.cached + (call.cachedTokens || 0), writes: sum.writes + (call.cacheWriteTokens || 0), output: sum.output + (call.outputTokens || 0), reasoning: sum.reasoning + (call.reasoningTokens || 0), cost: sum.cost + Number(call.estimatedCost || 0), success: sum.success + (call.success ? 1 : 0) }), { input: 0, cached: 0, writes: 0, output: 0, reasoning: 0, cost: 0, success: 0 });
  return { calls: calls.length, ...totals, usageMissing: calls.filter(call => call.usageStatus !== "COMPLETE").length };
}

/** Clear customer-facing content without cascading away the usage ledger. */
export async function cleanupSupportData(now = new Date()): Promise<{ turns: number; calls: number }> {
  const conversationCutoff = new Date(now.getTime() - 30 * 86400 * 1000);
  const callCutoff = new Date(now.getTime() - 180 * 86400 * 1000);
  const stale = await prisma.supportConversation.findMany({ where: { OR: [{ expiresAt: { lt: now } }, { updatedAt: { lt: conversationCutoff } }] }, select: { id: true } });
  let turns = 0;
  if (stale.length) {
    const result = await prisma.supportTurn.updateMany({ where: { conversationId: { in: stale.map(item => item.id) } }, data: { userText: "[对话内容已按保留策略清理]", answerText: null, sources: Prisma.JsonNull, facts: Prisma.JsonNull } });
    turns = result.count;
    await prisma.supportConversation.updateMany({ where: { id: { in: stale.map(item => item.id) } }, data: { userId: null, anonymousKey: null, title: "已清理客服会话" } });
  }
  const calls = await prisma.supportModelCall.deleteMany({ where: { createdAt: { lt: callCutoff } } });
  return { turns, calls: calls.count };
}

