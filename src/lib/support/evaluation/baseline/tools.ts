// Frozen evaluation baseline from d16f4fccd8feb53f15e624440bee0e04dfb32efa. Do not update with production changes.
import { z } from "zod";
import { supportPages, type SupportPage } from "../../ui";

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


/** Shared by the planner and executor so a plan is validated before any query. */
export function validateSupportTool(name: string, raw: unknown): Record<string, string> {
  if (name === 'search_products' || name === 'search_knowledge') return query.parse(raw);
  if (name === 'get_navigation') return z.object({ page: z.enum(Object.keys(supportPages) as [SupportPage, ...SupportPage[]]) }).strict().parse(raw);
  if (!supportTools.some(tool => tool.name === name)) throw new Error('UNKNOWN_TOOL');
  return empty.parse(raw);
}
