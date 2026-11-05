import { z } from "zod";
import { getSettings } from "@/lib/services/settings.service";
import { getPublicContactSettings } from "@/lib/contact-settings";
import { isPaymentEnabled } from "@/lib/payment/config";
import { supportPages, supportOrderAccess, supportNavigation, type SupportPage } from "./ui";
import { searchSupportKnowledge } from "./retriever";
import { withSupportDbAbort } from "./db-abort";

const query = z.object({ query: z.string().trim().max(200) }).strict();
const empty = z.object({}).strict();
const queryParameters = (description: string) => ({ type: "object", properties: { query: { type: "string", description } }, required: ["query"], additionalProperties: false });
const emptyParameters = { type: "object", properties: {}, required: [], additionalProperties: false };
export const supportTools = [
  { name: "search_products", description: "查当前上架商品、价格、库存。exactMatches 是名称匹配，relatedProducts 只是相关商品，不能视为用户指定型号。匹配分组只比较商品名称，不代表是否符合预算或用途；未指定名称时用空query列目录，再按返回价格/库存/描述选购。minQuantity/maxQuantity是每次订单中该商品的购买数量范围，不是每人累计限购；未问数量时无需主动补充。truncated表示有限结果，不代表全店。", parameters: queryParameters("只填商品名称、型号或品牌，最多200字符。预算/用途/价格问题不是名称，不填入query；未指定商品或查替代商品时传空字符串列目录。") },
  { name: "search_knowledge", description: "检索已发布的购买、使用、售后和账户知识。草稿不可见，不提供实时价格。", parameters: queryParameters("需要了解的商城政策、购买步骤或使用故障，最多200字符；保留商品与问题要点，不查询实时价格、库存或订单状态。") },
  { name: "get_payment_methods", description: "查本轮实际启用的支付方式。", parameters: emptyParameters },
  { name: "get_my_orders", description: "读取已登录账号的最近5笔订单摘要；游客不读取私人订单，返回免登录查询订单页面指引。无需且不接受userId。只问在哪里查订单时用get_navigation。", parameters: emptyParameters },
  { name: "get_contacts", description: "用户要求联系人工或问题需人工处理时，查当前公开渠道；只提供联系指引，不发送消息、不创建工单、不转接人工。", parameters: emptyParameters },
  { name: "get_navigation", description: "用户需要浏览、购买、订单查询、登录或充值等页面时，选择站内目标，由服务端生成跳转按钮。通用订单查询选order_query，无需登录；my_orders只用于已登录账号，游客会返回公共查询入口。不接受URL，不会执行购买或支付。", parameters: { type: "object", properties: { page: { type: "string", enum: Object.keys(supportPages) } }, required: ["page"], additionalProperties: false } },
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

export async function executeSupportTool(name: string, raw: unknown, userId?: string, signal?: AbortSignal): Promise<unknown> {
  signal?.throwIfAborted();
  validateSupportTool(name, raw);
  if (name === "search_products") {
    const { query: text } = query.parse(raw);
    const tokens = [...new Set(text.toLowerCase().match(/[a-z0-9]+|[\u4e00-\u9fff]+/g) || [])].slice(0, 8);
    const where = { isActive: true, category: { isActive: true }, ...(tokens.length ? { OR: tokens.flatMap(token => [{ name: { contains: token, mode: "insensitive" as const } }, { slug: { contains: token, mode: "insensitive" as const } }]) } : {}) };
    const rows = await withSupportDbAbort(signal, tx => tx.product.findMany({ where, orderBy: [{ sort: "asc" }, { id: "asc" }], take: 21, select: { name: true, slug: true, price: true, stock: true, minQuantity: true, maxQuantity: true, description: true } }));
    const products = rows.slice(0, 20).map(p => ({ name: p.name, url: `/product/${encodeURIComponent(p.slug)}`, priceCny: p.price / 100, stock: p.stock, minQuantity: p.minQuantity, maxQuantity: p.maxQuantity, description: (p.description || "").slice(0, 1000) }));
    const exact = (p: typeof products[number]) => Boolean(text) && normalize(p.name).includes(normalize(text));
    return { queriedAt: new Date().toISOString(), query: text, exactMatches: products.filter(exact), relatedProducts: products.filter(p => !exact(p)), truncated: rows.length > 20 };
  }
  if (name === "search_knowledge") {
    const { query: text } = query.parse(raw);
    const result = await searchSupportKnowledge(text, 4, signal);
    return { sources: result.sources, context: result.context.slice(0, 12000) };
  }
  if (name === "get_navigation") {
    const { page } = z.object({ page: z.enum(Object.keys(supportPages) as [SupportPage, ...SupportPage[]]) }).strict().parse(raw);
    return supportNavigation(page, Boolean(userId));
  }
  if (!supportTools.some(tool => tool.name === name)) throw new Error("UNKNOWN_TOOL");
  empty.parse(raw);
  if (name === "get_payment_methods") {
    const labels = [["WECHAT", "微信支付"], ["ALIPAY", "支付宝"], ["USDT_TRC20", "USDT(TRC20)"], ["BALANCE", "账户余额"]] as const;
    return { queriedAt: new Date().toISOString(), paymentMethods: (await Promise.all(labels.map(async ([id, label]) => await isPaymentEnabled(id, signal) ? label : null))).filter(Boolean) };
  }
  if (name === "get_contacts") return { queriedAt: new Date().toISOString(), ...getPublicContactSettings(await getSettings(signal)) };
  if (name === "get_my_orders") {
    if (!userId) return supportOrderAccess(false);
    const orders = await withSupportDbAbort(signal, tx => tx.order.findMany({ where: { userId }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 5, select: { orderNo: true, status: true, payAmount: true, createdAt: true, items: { select: { productName: true, quantity: true } } } }));
    return { ...supportOrderAccess(true), queriedAt: new Date().toISOString(), orders: orders.map(({ payAmount, ...order }) => ({ ...order, payAmountCny: payAmount / 100 })) };
  }
  return { announcements: await withSupportDbAbort(signal, tx => tx.announcement.findMany({ where: { isActive: true }, orderBy: [{ isPinned: "desc" }, { sort: "asc" }], take: 5, select: { title: true, content: true } })) };
}
