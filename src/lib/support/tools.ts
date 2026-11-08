import { getSettings } from "@/lib/services/settings.service";
import { getPublicContactSettings } from "@/lib/contact-settings";
import { isPaymentEnabled } from "@/lib/payment/config";
import { supportOrderAccess, supportNavigation, type SupportPage } from "./ui";
import { searchSupportKnowledge } from "./retriever";
import { withSupportDbAbort } from "./db-abort";

export { supportTools, validateSupportTool } from './tool-contract';
import { validateSupportTool, productQuerySchema, articleReadSchema, SupportToolError } from './tool-contract';
import { Prisma } from '@prisma/client';
import { buildProductToolPage, buildKnowledgeSearchResult, buildKnowledgePage, normalizeProductName, type ProductToolRow } from './tool-results';

export async function executeSupportTool(name: string, raw: unknown, userId?: string, signal?: AbortSignal): Promise<unknown> {
  signal?.throwIfAborted();
  const args = validateSupportTool(name, raw);
  if (name === "search_products") {
    const input = productQuerySchema.parse(args);
    const tokens = [...new Set(input.query.toLowerCase().match(/[a-z0-9]+|[\u4e00-\u9fff]+/g) || [])].slice(0, 8);
    const normalized = normalizeProductName(input.query);
    const exact = normalized ? Prisma.sql`replace(regexp_replace(lower(p.name), '[^[:alnum:]]', '', 'g'), 'chatgpt', 'gpt') LIKE ${`%${normalized}%`}` : Prisma.sql`false`;
    const match = tokens.length ? Prisma.sql`(${exact} OR ${Prisma.join(tokens.map(token => Prisma.sql`(p.name ILIKE ${`%${token}%`} OR p.slug ILIKE ${`%${token}%`})`), ' OR ')})` : Prisma.sql`true`;
    const rows = await withSupportDbAbort(signal, tx => tx.$queryRaw<ProductToolRow[]>(Prisma.sql`
      SELECT p.name, p.slug, p.price, p.stock, p."minQuantity", p."maxQuantity", p.description
      FROM "Product" p JOIN "Category" c ON c.id = p."categoryId"
      WHERE p."isActive" = true AND c."isActive" = true AND ${match}
        AND ${input.inStockOnly ? Prisma.sql`p.stock > 0` : Prisma.sql`true`}
        AND ${input.minPriceCny !== null ? Prisma.sql`p.price >= ${Math.round(input.minPriceCny * 100)}` : Prisma.sql`true`}
        AND ${input.maxPriceCny !== null ? Prisma.sql`p.price <= ${Math.round(input.maxPriceCny * 100)}` : Prisma.sql`true`}
      ORDER BY CASE WHEN ${exact} THEN 0 ELSE 1 END, p.sort ASC, p.id ASC
      LIMIT ${input.limit + 1} OFFSET ${input.offset}
    `));
    return buildProductToolPage(rows, input);
  }
  if (name === "search_knowledge") {
    const result = await searchSupportKnowledge(args.query as string, 4, signal);
    return { ...buildKnowledgeSearchResult(result.articles), sources: result.sources };
  }
  if (name === "read_knowledge_article") {
    const { articleId, version, cursor } = articleReadSchema.parse(args);
    const article = await withSupportDbAbort(signal, tx => tx.supportArticle.findFirst({
      where: { id: articleId, status: 'PUBLISHED' }, select: { id: true, title: true, category: true, version: true, content: true },
    }));
    if (!article) throw new SupportToolError('KNOWLEDGE_UNAVAILABLE', '该知识已不可用，请重新检索已发布资料，不能继续依赖旧正文。');
    if (article.version !== version) throw new SupportToolError('KNOWLEDGE_CHANGED', '知识版本已变化，请重新检索并读取新版本，不混用旧内容。');
    return { ...buildKnowledgePage(article, cursor, 5400), sources: [{ id: article.id, title: article.title, category: article.category, version }] };
  }
  if (name === "get_navigation") return supportNavigation(args.page as SupportPage, Boolean(userId));
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
