import { z } from "zod";
import prisma from "@/lib/db";
import { getSettings } from "@/lib/services/settings.service";
import { getPublicContactSettings } from "@/lib/contact-settings";
import { isPaymentEnabled } from "@/lib/payment/config";
import { supportPages, type SupportPage } from "./ui";
import { searchSupportKnowledge } from "./retriever";

const query = z.object({ query: z.string().trim().max(200) }).strict();
const empty = z.object({}).strict();
const queryParameters = { type: "object", properties: { query: { type: "string", description: "商品名称/型号或知识问题；商品空字符串可列目录。先查具体型号，无精确匹配可查品牌。" } }, required: ["query"], additionalProperties: false };
const emptyParameters = { type: "object", properties: {}, required: [], additionalProperties: false };
export const supportTools = [
  { name: "search_products", description: "查当前上架商品、价格、库存。exactMatches 是名称匹配，relatedProducts 只是相关商品，不能视为用户指定型号。超过返回上限会标明 truncated，应缩小查询。", parameters: queryParameters },
  { name: "search_knowledge", description: "检索已发布的购买、使用、售后和账户知识。草稿不可见，不提供实时价格。", parameters: queryParameters },
  { name: "get_payment_methods", description: "查本轮实际启用的支付方式。", parameters: emptyParameters },
  { name: "get_my_orders", description: "仅查询服务端认证用户的最近5笔订单摘要。无需且不接受 userId；游客返回登录/订单查询指引。", parameters: emptyParameters },
  { name: "get_contacts", description: "查已保存的微信客服二维码、联系方式及 Telegram，不会发送消息。", parameters: emptyParameters },
  { name: "get_navigation", description: "用户需要浏览、购买、订单查询、登录或充值等页面时，选择站内目标，由服务端生成跳转按钮。不接受URL，不会执行购买或支付。", parameters: { type: "object", properties: { page: { type: "string", enum: Object.keys(supportPages) } }, required: ["page"], additionalProperties: false } },
  { name: "get_announcements", description: "查当前公开公告。", parameters: emptyParameters },
].map(tool => ({ type: "function" as const, strict: true, ...tool }));

const normalize = (value: string) => value.toLowerCase().replace(/[^\p{L}\p{N}]/gu, "").replace(/chatgpt/g, "gpt");

/** Shared by the planner and executor so a plan is validated before any query. */
export function validateSupportTool(name: string, raw: unknown): Record<string, string> {
  if (name === 'search_products' || name === 'search_knowledge') return query.parse(raw);
  if (name === 'get_navigation') return z.object({ page: z.enum(Object.keys(supportPages) as [SupportPage, ...SupportPage[]]) }).strict().parse(raw);
  if (!supportTools.some(tool => tool.name === name)) throw new Error('UNKNOWN_TOOL');
  return empty.parse(raw);
}

export async function executeSupportTool(name: string, raw: unknown, userId?: string): Promise<unknown> {
  validateSupportTool(name, raw);
  if (name === "search_products") {
    const { query: text } = query.parse(raw);
    const tokens = [...new Set(text.toLowerCase().match(/[a-z0-9]+|[\u4e00-\u9fff]+/g) || [])].slice(0, 8);
    const where = { isActive: true, category: { isActive: true }, ...(tokens.length ? { OR: tokens.flatMap(token => [{ name: { contains: token, mode: "insensitive" as const } }, { slug: { contains: token, mode: "insensitive" as const } }]) } : {}) };
    const rows = await prisma.product.findMany({ where, orderBy: [{ sort: "asc" }, { id: "asc" }], take: 21, select: { name: true, slug: true, price: true, stock: true, minQuantity: true, maxQuantity: true, description: true } });
    const products = rows.slice(0, 20).map(p => ({ name: p.name, url: `/product/${encodeURIComponent(p.slug)}`, priceCny: p.price / 100, stock: p.stock, minQuantity: p.minQuantity, maxQuantity: p.maxQuantity, description: (p.description || "").slice(0, 1000) }));
    const exact = (p: typeof products[number]) => Boolean(text) && normalize(p.name).includes(normalize(text));
    return { queriedAt: new Date().toISOString(), query: text, exactMatches: products.filter(exact), relatedProducts: products.filter(p => !exact(p)), truncated: rows.length > 20 };
  }
  if (name === "search_knowledge") {
    const { query: text } = query.parse(raw);
    const result = await searchSupportKnowledge(text, 4);
    return { sources: result.sources, context: result.context.slice(0, 12000) };
  }
  if (name === "get_navigation") {
    const { page } = z.object({ page: z.enum(Object.keys(supportPages) as [SupportPage, ...SupportPage[]]) }).strict().parse(raw);
    return { page, ...supportPages[page] };
  }
  if (!supportTools.some(tool => tool.name === name)) throw new Error("UNKNOWN_TOOL");
  empty.parse(raw);
  if (name === "get_payment_methods") {
    const labels = [["WECHAT", "微信支付"], ["ALIPAY", "支付宝"], ["USDT_TRC20", "USDT(TRC20)"], ["BALANCE", "账户余额"]] as const;
    return { queriedAt: new Date().toISOString(), paymentMethods: (await Promise.all(labels.map(async ([id, label]) => await isPaymentEnabled(id) ? label : null))).filter(Boolean) };
  }
  if (name === "get_contacts") return { queriedAt: new Date().toISOString(), ...getPublicContactSettings(await getSettings()) };
  if (name === "get_my_orders") {
    if (!userId) return { requiresLogin: true, guidance: "请登录查看本人订单，或使用 /order 页面完成验证码和订单密码解锁。" };
    const orders = await prisma.order.findMany({ where: { userId }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 5, select: { orderNo: true, status: true, payAmount: true, createdAt: true, items: { select: { productName: true, quantity: true } } } });
    return { queriedAt: new Date().toISOString(), orders: orders.map(({ payAmount, ...order }) => ({ ...order, payAmountCny: payAmount / 100 })) };
  }
  return { announcements: await prisma.announcement.findMany({ where: { isActive: true }, orderBy: [{ isPinned: "desc" }, { sort: "asc" }], take: 5, select: { title: true, content: true } }) };
}
