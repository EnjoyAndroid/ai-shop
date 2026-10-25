import { getSupportPolicy, SUPPORT_CONFIG_LOCK } from './policy-store';
import { randomBytes, randomUUID } from "crypto";
import { cookies } from "next/headers";
import { Prisma } from "@prisma/client";
import { auth } from "@/lib/auth";
import prisma from "@/lib/db";
import { getSupportConfig, redactSupportText, supportModelConfigured } from "./config";
import { getSupportFacts, searchSupportKnowledge, type SupportFacts } from "./retriever";
import { generateSupportAnswer, SupportLlmError } from "./llm";
import { SUPPORT_GREETING, SUPPORT_NAME, MEMBER_SESSION_SECONDS, GUEST_SESSION_SECONDS, isOutOfScopeSupportQuestion, supportGreetingAnswer, SUPPORT_SCOPE_REFUSAL, SUPPORT_SCOPE_CLARIFICATION, SUPPORT_SCOPE_UNAVAILABLE } from "./policy";
import { executeSupportTool } from "./tools";
import { recentContext, nextContextSummary } from "./context";
import { buildSupportUi, modelToolResult, readSupportUi, cleanSupportAnswer } from "./ui";
import redis from "@/lib/redis";
import { rateLimit } from "@/lib/rate-limit";
import { trustedSupportFaq } from "./faq";
import { SUPPORT_LIMITS } from "./limits";
import { reserveSupportCall, settleSupportCall } from "./budget";
import { supportIdentityHash, acquireSupportPermit, SupportRiskError, recordRisk, checkSupportBlock, checkSupportCircuit, recordModelOutcome } from "./risk";
import type { ClientIpInfo } from "@/lib/get-client-ip";

const ANON_COOKIE = "support_anon";
export class SupportRequestError extends Error {
  constructor(message: string, public status: number, public code?: string, public retryAfter?: number) { super(message); }
}

export interface SupportIdentity { userId?: string; anonymousKey: string; }

const UNKNOWN_CLIENT_IP: ClientIpInfo = { value: "unknown", trusted: false };
export async function getSupportIdentity(): Promise<SupportIdentity> {
  const session = await auth();
  const userId = typeof session?.user?.id === "string" ? session.user.id : undefined;
  const cookieStore = await cookies();
  const current = cookieStore.get(ANON_COOKIE)?.value;
  const anonymousKey = current && /^[a-f0-9]{64}$/.test(current) ? current : randomBytes(32).toString("hex");
  if (!userId && anonymousKey !== current) cookieStore.set(ANON_COOKIE, anonymousKey, { httpOnly: true, sameSite: "strict", secure: process.env.NODE_ENV === "production", maxAge: GUEST_SESSION_SECONDS, path: "/" });
  return { userId, anonymousKey };
}

/** Scope a support conversation to exactly one authenticated account or one anonymous browser. */
export function supportConversationScope(identity: SupportIdentity): Prisma.SupportConversationWhereInput {
  return identity.userId ? { userId: identity.userId } : { userId: null, anonymousKey: identity.anonymousKey };
}

export function isSupportConversationAccessible(
  conversation: { userId: string | null; anonymousKey: string | null; expiresAt: Date },
  identity: SupportIdentity,
  now = new Date(),
): boolean {
  if (conversation.expiresAt <= now) return false;
  return identity.userId
    ? conversation.userId === identity.userId
    : conversation.userId === null && conversation.anonymousKey === identity.anonymousKey;
}

function isPaymentMethodsQuestion(question: string): boolean {
  // A payment mention alone is not a request for payment methods (delivery,
  // failures, refunds and recharge problems have their own published answers).
  if (/成功|失败|不到账|未到账|没到账|扣款|退款|卡密|兑换码|发货/.test(question)) return false;
  return /(?:支付|付款|充值)(?:的)?方式|支持.*(?:支付|付款)|可以用什么支付|(?:怎么|如何)付款|能(?:用|不能用).*(?:支付宝|微信|USDT|余额)/i.test(question);
}

function normalizedQuestion(value: string): string { return value.toLowerCase().replace(/[^\p{L}\p{N}]/gu, ""); }

function isProductQuestion(question: string): boolean {
  if (/怎么买|如何购买|购买流程|怎么下单/.test(question)) return false;
  return /多少钱|价格|售价|月费|一个月|卖多少/.test(question) || /(?:有哪些|列表|在售).*(?:商品|产品)|(?:商品|产品).*(?:有哪些|列表|在售)/.test(question);
}

function productMatchKind(question: string, product: SupportFacts["products"][number]): "exact" | "related" | "none" {
  const normalize = (text: string) => text.toLowerCase().replace(/chatgpt/g, "gpt");
  const tokens = (text: string): string[] => normalize(text).match(/[a-z0-9]+/g) || [];
  const requested = tokens(question);
  const offered = tokens(product.name);
  if (requested.length && requested.every(token => offered.includes(token))) return "exact";
  if (requested.some(token => token.length >= 3 && offered.includes(token))) return "related";
  if (normalizedQuestion(question).includes(normalizedQuestion(product.name))) return "exact";
  return "none";
}

function formatProduct(product: SupportFacts["products"][number]): string {
  return `${product.name}：¥${product.priceCny.toFixed(2)}${product.stock > 0 ? `，当前有货（${product.stock} 件）` : "，当前缺货"}。`;
}

function productAnswer(question: string, facts: SupportFacts): string {
  if (/(?:有哪些|列表|在售).*(?:商品|产品)|(?:商品|产品).*(?:有哪些|列表|在售)/.test(question)) return facts.products.map(formatProduct).join("\n") || "暂未查询到在售商品。";
  const exact = facts.products.filter(product => productMatchKind(question, product) === "exact");
  if (exact.length) return exact.map(formatProduct).join("\n");
  const related = facts.products.filter(product => productMatchKind(question, product) === "related");
  if (related.length) return `不好意思，店内暂时没有找到你说的商品。当前相关商品有：\n${related.map(formatProduct).join("\n")}`;
  return facts.products.length
    ? "不好意思，店内暂时没有找到你说的商品。你可以告诉我想了解的品牌或会员套餐，我再帮你查询。"
    : "当前暂未查询到在售商品，请稍后重试。";
}

function isContactQuestion(question: string): boolean {
  return /客服|人工|微信|二维码|telegram|联系我/i.test(question);
}

function contactAnswer(facts: SupportFacts): string {
  const channels: string[] = [];
  if (facts.contacts.wechatSupportQrUrl) channels.push("微信客服二维码已配置，请扫描下方二维码联系微信客服");
  else if (facts.contacts.wechatSupportText) channels.push(`微信客服：${facts.contacts.wechatSupportText}`);
  if (facts.contacts.telegramUrl) channels.push(`Telegram：${facts.contacts.telegramUrl}`);
  return channels.length ? `${channels.join("；")}。` : "当前暂未配置客服联系方式，请稍后重试或联系管理员。";
}

export function supportExpiry(identity: SupportIdentity, now = new Date()): Date {
  return new Date(now.getTime() + (identity.userId ? MEMBER_SESSION_SECONDS : GUEST_SESSION_SECONDS) * 1000);
}
export async function renewSupportCookie(identity: SupportIdentity) {
  if (!identity.userId) (await cookies()).set(ANON_COOKIE, identity.anonymousKey, { httpOnly: true, sameSite: "strict", secure: process.env.NODE_ENV === "production", maxAge: GUEST_SESSION_SECONDS, path: "/" });
}
export async function touchSupportConversation(id: string, identity: SupportIdentity) {
  const result = await prisma.supportConversation.updateMany({ where: { id, ...supportConversationScope(identity), expiresAt: { gt: new Date() } }, data: { updatedAt: new Date(), ...(!identity.userId ? { expiresAt: supportExpiry(identity) } : {}) } });
  if (!result.count) throw new SupportRequestError("客服会话不存在或已过期", 404);
}
const turnFields = { id: true, userText: true, answerText: true, createdAt: true, ui: true } as const;
const turnOrder = [{ createdAt: "desc" as const }, { id: "desc" as const }];
export async function createSupportConversation(identity: SupportIdentity) {
  return prisma.supportConversation.create({ data: { userId: identity.userId, anonymousKey: identity.userId ? null : identity.anonymousKey, expiresAt: supportExpiry(identity) }, select: { id: true, title: true, createdAt: true, turns: { select: turnFields } } });
}
async function retainedSupportTurns() {
  const policy=await getSupportPolicy();
  return {clearedAt:null,createdAt:{gt:new Date(Date.now()-policy.detailRetentionDays*86400000)}};
}
export async function getLatestSupportConversation(identity: SupportIdentity) {
  const retained=await retainedSupportTurns();
  const conversation = await prisma.supportConversation.findFirst({
    where: { expiresAt: { gt: new Date() }, ...supportConversationScope(identity) },
    orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
    select: { id: true, title: true, createdAt: true, turns: { where:retained, orderBy: turnOrder, take: 40, select: turnFields } },
  });
  return conversation ? { ...conversation, title:conversation.createdAt>retained.createdAt.gt?conversation.title:null, turns: conversation.turns.reverse() } : null;
}
export async function getSupportConversation(id: string, identity: SupportIdentity) {
  const retained=await retainedSupportTurns();
  const conversation = await prisma.supportConversation.findFirst({ where: { id, expiresAt: { gt: new Date() }, ...supportConversationScope(identity) }, select: { id: true, title: true, createdAt:true, turns: { where:retained, orderBy: turnOrder, take: 40, select: turnFields } } });
  return conversation ? { ...conversation, title:conversation.createdAt>retained.createdAt.gt?conversation.title:null, turns: conversation.turns.reverse() } : null;
}
export function fallbackAnswer(question: string, knowledgeAnswer: string, facts: SupportFacts): string {
  // Dynamic questions must be answered from current business facts before
  // returning broad article matches. Otherwise a stock question can surface
  // unrelated refund/payment articles when the LLM is intentionally disabled.
  if (trustedSupportFaq(question) === "哪些商品有库存？") {
    const available = facts.products.filter(product => product.stock > 0);
    return available.length
      ? available.map(product => `${product.name}：有货（${product.stock} 件），售价 ¥${product.priceCny.toFixed(2)}`).join("\n")
      : "当前暂无有库存的上架商品，请稍后再来查看。";
  }
  if (/库存|有货|售罄|哪些商品/.test(question)) return facts.products.length ? facts.products.map(product => `${product.name}：${product.stock > 0 ? `有货（${product.stock} 件）` : "暂时缺货"}，售价 ¥${product.priceCny.toFixed(2)}`).join("\n") : "当前暂未查询到商品信息，请稍后重试。";
  if (isProductQuestion(question)) return productAnswer(question, facts);
  if (isPaymentMethodsQuestion(question)) return facts.paymentMethods.length ? `当前可用支付方式：${facts.paymentMethods.join("、")}。实际以付款页面显示为准。` : "当前暂未查询到可用支付方式，请稍后重试或联系客服。";
  if (isContactQuestion(question)) {
    if (facts.contacts.wechatSupportQrUrl || facts.contacts.wechatSupportText || facts.contacts.telegramUrl) return contactAnswer(facts);
    if (knowledgeAnswer) return knowledgeAnswer;
    return contactAnswer(facts);
  }
  if (knowledgeAnswer) return knowledgeAnswer;
  return "我暂时没有找到对应的帮助内容。你可以换一种说法，或点击联系客服获取人工帮助。";
}

export { SUPPORT_GREETING, SUPPORT_NAME };

export async function answerSupportTurn(conversationId: string, requestId: string, question: string, identity: SupportIdentity, clientIp: ClientIpInfo = UNKNOWN_CLIENT_IP, requestSignal?: AbortSignal) {
  // Shared Redis lock bounds duplicate and concurrent generation across app processes.
  const lockKey = `support:turn-lock:${conversationId}`;
  const lockToken = randomUUID();
  if (await redis.set(lockKey, lockToken, "PX", 120000, "NX") !== "OK") throw new SupportRequestError("客服正在回答，请稍后再试", 409);
  const signal = AbortSignal.any([...(requestSignal ? [requestSignal] : []), AbortSignal.timeout(SUPPORT_LIMITS.totalTimeoutMs)]);
  let createdTurnId: string | undefined;
  try { return await answerLocked(conversationId, requestId, question, identity, clientIp, signal, id=>{createdTurnId=id;}); }
  catch (error) {
    if(createdTurnId) await prisma.supportTurn.updateMany({ where: { id:createdTurnId, conversationId, requestId, clearedAt:null, conversation:supportConversationScope(identity), status: 'PROCESSING' }, data: { status: signal.aborted ? 'CANCELLED' : 'FAILED', answerText: '本次回答未完成，请重新提问。' } });
    throw error;
  }
  finally { await redis.eval("if redis.call('GET', KEYS[1]) == ARGV[1] then return redis.call('DEL', KEYS[1]) end return 0", 1, lockKey, lockToken); }
}

async function answerLocked(conversationId: string, requestId: string, question: string, identity: SupportIdentity, clientIp: ClientIpInfo, requestSignal?: AbortSignal, onCreated?: (id:string)=>void) {
  const started = Date.now();
  const retained=await retainedSupportTurns();
  const conversation = await prisma.supportConversation.findFirst({ where: { id: conversationId, expiresAt: { gt: new Date() }, ...supportConversationScope(identity) }, select: { id: true, title: true, createdAt:true, expiresAt: true, contextSummary: true, turns: { where: { ...retained, status: { in: ["FAQ", "COMPLETED", "FALLBACK"] } }, orderBy: turnOrder, take: 12, select: turnFields } } });
  if (!conversation) throw new SupportRequestError("客服会话不存在或已过期", 404);
  const existing = await prisma.supportTurn.findUnique({ where: { conversationId_requestId: { conversationId, requestId } }, select: { id: true, createdAt:true, clearedAt:true, answerText: true, status: true, ui: true } });
  if (existing) {
    if(existing.clearedAt||existing.createdAt<=retained.createdAt.gt)throw new SupportRequestError("问答已超过保留期，请重新提问",410);
    if (existing.status.startsWith('RISK_')) throw new SupportRequestError(existing.answerText || '客服请求受限', 429, existing.status.slice(5), 60);
    await touchSupportConversation(conversationId, identity);
    if (!existing.answerText) throw new SupportRequestError("上次回答未完成，请重新提问", 409);
    return { turnId: existing.id, answer: existing.answerText, status: existing.status, ui: readSupportUi(existing.ui) };
  }
  if (!await rateLimit("support-identity", identity.userId || identity.anonymousKey, 30, 60)) throw new SupportRequestError("客服请求过于频繁，请稍后再试", 429);
  await touchSupportConversation(conversationId, identity);
  let summary = conversation.createdAt>retained.createdAt.gt ? conversation.contextSummary : '';
  const retainedTitle=conversation.createdAt>retained.createdAt.gt?conversation.title:null;
  const contextDates=conversation.turns.map(turn=>turn.createdAt);
  if(summary||retainedTitle)contextDates.push(conversation.createdAt);
  if (!summary && conversation.turns.length === 12) {
    const older = await prisma.supportTurn.findMany({ where: { conversationId, ...retained, status: { in: ["FAQ", "COMPLETED", "FALLBACK"] } }, orderBy: turnOrder, skip: 12, take: 30, select: { userText: true, answerText: true, createdAt:true } });
    contextDates.push(...older.map(turn=>turn.createdAt));
    summary = older.reverse().map(t => `用户关注：${t.userText.slice(0, 150)}；当时回答（可能过时）：${(t.answerText || "未完成").slice(0, 120)}`).join("\n").slice(-6000);
  }
  async function assertContextRetained(client: Pick<Prisma.TransactionClient,'systemSetting'|'supportTurn'> = prisma) {
    const policy=await getSupportPolicy(client);
    const cutoff=Date.now()-policy.detailRetentionDays*86400000;
    const cleaned=await client.supportTurn.count({where:{conversationId,clearedAt:{gte:new Date(started)}}});
    if(cleaned || contextDates.some(date=>date.getTime()<=cutoff)) {
      throw new SupportRequestError('对话上下文已更新，请重新提问',409,'CONTEXT_EXPIRED');
    }
  }
  const safeQuestion = redactSupportText(question.trim());
  const trustedFaq = trustedSupportFaq(question);
  const identityHash = supportIdentityHash(identity);
  const config = await getSupportConfig();
  const outOfScope = isOutOfScopeSupportQuestion(question);
  const greeting = supportGreetingAnswer(safeQuestion);
  const turn = await prisma.supportTurn.create({ data: { conversationId, requestId, userText: safeQuestion, status: "PROCESSING", clientIp: clientIp.trusted ? clientIp.value : null, clientIpTrusted: clientIp.trusted, identityHash, modelTurn: false } });
  onCreated?.(turn.id);
  const sources: unknown[] = [];
  const evidence: Array<{ tool: string; arguments: unknown; result: unknown }> = [];
  let answer = "";
  let status = "FALLBACK";
  let riskError: SupportRiskError | undefined;
  let permitRelease: (() => Promise<void>) | null = null;
  if (outOfScope) {
    answer = SUPPORT_SCOPE_REFUSAL;
    status = "OUT_OF_SCOPE";
  } else if (supportGreetingAnswer(safeQuestion)) {
    answer = greeting!; status = "GREETING";
  } else if (trustedFaq) {
    // Complete, preapproved FAQs need current data, not model classification
    // and tool-selection round trips. Reuse the deterministic query path below.
    status = "FAQ";
  } else if (supportModelConfigured(config)) {
    const pendingTools = new Set<Promise<unknown>>();
    try {
      permitRelease = await acquireSupportPermit(identity, clientIp, safeQuestion);
      answer = await generateSupportAnswer({ question: safeQuestion, history: recentContext(conversation.turns), summary, config,
        beforeCall: async start => {
          await assertContextRetained();
          if (!await getSupportConversation(conversationId, identity)) throw new SupportRequestError("客服会话不存在或已过期", 404);
          await checkSupportBlock(identity, clientIp);
          await checkSupportCircuit();
          return reserveSupportCall(turn.id, start, config);
        },
        execute: (name, args, signal) => {
          const pending = (async () => {
            signal?.throwIfAborted();
            await assertContextRetained();
            if (!await getSupportConversation(conversationId, identity)) throw new SupportRequestError("客服会话不存在或已过期", 404);
            const result = await executeSupportTool(name, args, identity.userId, signal);
            signal?.throwIfAborted();
            evidence.push({ tool: name, arguments: args, result });
            if (name === "search_knowledge" && result && typeof result === "object" && "sources" in result) sources.push(...(result as { sources: unknown[] }).sources);
            return modelToolResult(name, result);
          })();
          pendingTools.add(pending);
          void pending.then(() => pendingTools.delete(pending), () => pendingTools.delete(pending));
          return pending;
        },
        recordCall: async call => {
          await settleSupportCall(call);
        },
        signal: requestSignal,
      });
      status = "COMPLETED";
      await recordModelOutcome(false);
    } catch (error) {
      if (error instanceof SupportRequestError) throw error;
      if (error instanceof SupportRiskError) {
        riskError = error; status = `RISK_${error.code}`; answer = error.message;
        await recordRisk(error.code, identity, clientIp, { retryAfter: error.retryAfter });
      } else
      if (error instanceof SupportLlmError && ["OUT_OF_SCOPE", "SCOPE_CLARIFY", "SCOPE_UNAVAILABLE"].includes(error.code)) {
        await recordModelOutcome(error.code === 'SCOPE_UNAVAILABLE');
        answer = error.code === "OUT_OF_SCOPE" ? SUPPORT_SCOPE_REFUSAL : error.code === "SCOPE_CLARIFY" ? SUPPORT_SCOPE_CLARIFICATION : SUPPORT_SCOPE_UNAVAILABLE;
        status = error.code;
      } else {
        if (error instanceof SupportLlmError && !['CANCELLED', 'BUDGET', 'INPUT_LIMIT', 'OUT_OF_SCOPE', 'SCOPE_CLARIFY'].includes(error.code)) await recordModelOutcome(true);
        status = error instanceof SupportLlmError ? error.code === 'CANCELLED' ? 'CANCELLED' : `FALLBACK_${error.code}` : 'FALLBACK_ERROR';
        // Before planning succeeds, never bypass scope checks with broad data lookup.
        answer = status === 'CANCELLED' ? '本次请求已取消，请重新提问。' : '智能回答暂时不可用，请使用常见问题或联系人工客服。';
      }
    } finally {
      // Cancellation returns from the model wrapper first. Keep the permit until
      // its database tools have stopped and their transactions have rolled back.
      await Promise.allSettled([...pendingTools]);
      if (permitRelease) await permitRelease();
    }
  }
  let savedFacts: unknown = { queries: evidence };
  if (!answer) {
    try {
      const fallbackQuestion = trustedFaq || safeQuestion;
      const [knowledge, facts] = await Promise.all([searchSupportKnowledge(fallbackQuestion), getSupportFacts(identity.userId, { inStockOnly: trustedFaq === "哪些商品有库存？" })]);
      answer = fallbackAnswer(fallbackQuestion, knowledge.answer, facts);
      sources.push(...knowledge.sources);
      savedFacts = { ...facts, queries: evidence };
      // Fallback uses the same verified presentation contract without requiring a model.
      if (isContactQuestion(safeQuestion)) evidence.push({ tool: 'get_contacts', arguments: {}, result: facts.contacts });
      if (isProductQuestion(safeQuestion) || /库存|有货|售罄|哪些商品/.test(safeQuestion)) evidence.push({ tool: 'search_products', arguments: {}, result: { exactMatches: [], relatedProducts: facts.products.filter(p => answer.includes(p.name)).map(p => ({ name: p.name, url: `/product/${encodeURIComponent(p.slug)}` })) } });
      const ids = knowledge.sources.map(source => source.id);
      if (ids.includes('support-buying')) evidence.push({ tool: 'get_navigation', arguments: {}, result: { page: 'products' } });
      if (ids.includes('support-order') || ids.includes('support-delivery')) evidence.push({ tool: 'get_my_orders', arguments: {}, result: {} });
      if (supportModelConfigured(config) && !trustedFaq) answer = `智能回答暂时不可用，以下是查询到的基础信息：\n${answer}`;
    } catch { answer = "抱歉，当前查询服务暂时不可用，请稍后重试。"; status = "FALLBACK_QUERY_FAILED"; }
  }
  answer = redactSupportText(answer).replace(/^(?:参考[：:].*|知识\d+《.*》)\s*$/gm, "").trim();
  const ui = buildSupportUi(evidence, answer, identity.userId);
  answer = cleanSupportAnswer(answer, ui);
  // Serialize with retention changes/cleanup: no stale answer or summary can revive cleared data.
  await prisma.$transaction(async tx => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(${SUPPORT_CONFIG_LOCK})`;
    await assertContextRetained(tx);
    const valid = await tx.supportConversation.updateMany({ where: { id: conversationId, ...supportConversationScope(identity), expiresAt: { gt: new Date() } }, data: { updatedAt: new Date(), ...(!identity.userId ? { expiresAt: supportExpiry(identity) } : {}), title: retainedTitle || safeQuestion.slice(0, 40), contextSummary: ["FAQ", "COMPLETED", "FALLBACK"].includes(status) ? nextContextSummary(summary, conversation.turns) : summary } });
    if (!valid.count) throw new SupportRequestError("客服会话不存在或已过期", 404);
    await tx.supportTurn.update({ where: { id: turn.id }, data: { answerText: answer, status, latencyMs: Date.now() - started, sources: sources as Prisma.InputJsonValue, facts: JSON.parse(JSON.stringify(savedFacts)), ui: JSON.parse(JSON.stringify(ui)) } });
  });
  if (riskError) throw new SupportRequestError(riskError.message, 429, riskError.code, riskError.retryAfter);
  return { turnId: turn.id, answer, status, ui };
}

export async function setSupportFeedback(turnId: string, value: number, identity: SupportIdentity): Promise<boolean> {
  const updated = await prisma.supportTurn.updateMany({ where: { id: turnId, conversation: { ...supportConversationScope(identity), expiresAt: { gt: new Date() } } }, data: { feedback: value } });
  return updated.count > 0;
}

export { supportUsageSummary, listSupportRisk, createSupportBlock, revokeSupportBlock } from "./admin";

/** Content ages independently of conversation activity; usage keeps a longer lifetime. */
export async function cleanupSupportData(now = new Date()) {
  const result = await prisma.$transaction(async tx => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(${SUPPORT_CONFIG_LOCK})`;
    const retention = await getSupportPolicy(tx);
    const cutoff = new Date(now.getTime() - retention.detailRetentionDays * 86400000);
    const callCutoff = new Date(now.getTime() - retention.usageRetentionDays * 86400000);
    const stale = await tx.supportTurn.findMany({ where: { createdAt: { lt: cutoff }, clearedAt: null }, select: { id: true, conversationId: true }, take: 1000 });
    const turns = await tx.supportTurn.updateMany({ where: { id: { in: stale.map(t => t.id) } }, data: { userText: '[对话内容已按保留策略清理]', answerText: null, sources: Prisma.JsonNull, facts: Prisma.JsonNull, ui: Prisma.JsonNull, clientIp: null, clientIpTrusted: false, identityHash: null, clearedAt: now } });
    // Summaries can contain excerpts from any expired turn.
    await tx.supportConversation.updateMany({ where: { id: { in: [...new Set(stale.map(t => t.conversationId))] } }, data: { contextSummary: '', title: null } });
    await tx.supportConversation.updateMany({ where: { expiresAt: { lt: cutoff } }, data: { userId: null, anonymousKey: null, contextSummary: '', title: null } });
    await tx.supportModelCall.updateMany({ where: { accountingState: 'PENDING', createdAt: { lt: new Date(now.getTime()-120000) } }, data: { accountingState: 'UNCERTAIN', usageStatus: 'MISSING', errorCode: 'INTERRUPTED' } });
    await tx.supportTurn.updateMany({ where: { status: 'PROCESSING', clearedAt:null, createdAt: { lt: new Date(now.getTime()-120000) } }, data: { status: 'FAILED', answerText: '本次回答未完成，请重新提问。' } });
    const calls = await tx.supportModelCall.deleteMany({ where: { createdAt: { lt: callCutoff } } });
    await tx.supportTurn.deleteMany({ where: { createdAt: { lt: callCutoff }, modelCalls: { none: {} } } });
    await tx.supportConversation.deleteMany({ where: { expiresAt: { lt: callCutoff }, turns: { none: {} } } });
    const events = await tx.supportRiskEvent.deleteMany({ where: { createdAt: { lt: cutoff } } });
    await tx.supportBlock.deleteMany({ where: { expiresAt: { lt: cutoff } } });
    await tx.supportBudgetDay.deleteMany({ where: { day: { lt: callCutoff } } });
    return { turns: turns.count, calls: calls.count, events: events.count };
  });
  return result;
}
