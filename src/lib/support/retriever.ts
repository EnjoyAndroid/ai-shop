import prisma from "@/lib/db";
import { getPublicContactSettings } from "@/lib/contact-settings";
import { isPaymentEnabled } from "@/lib/payment/config";
import { getSettings } from "@/lib/services/settings.service";

export interface SupportSource {
  id: string;
  title: string;
  category: string;
  version: number;
}

export interface SupportFacts {
  siteName: string;
  paymentMethods: string[];
  products: Array<{ name: string; slug: string; priceCny: number; stock: number; minQuantity: number; maxQuantity: number; description: string }>;
  orders: Array<{ orderNo: string; status: string; payAmountCny: number; createdAt: string; items: Array<{ productName: string; quantity: number }> }>;
  contacts: { telegramUrl: string; wechatSupportText: string; wechatSupportQrUrl: string };
  announcements: Array<{ title: string; content: string }>;
}

export interface SupportKnowledgeArticle extends SupportSource {
  question: string;
  aliases: string[];
  keywords: string[];
  content: string;
}

export interface SupportKnowledgeResult {
  sources: SupportSource[];
  context: string;
  answer: string;
}

export interface KnowledgeRetriever {
  search(query: string, limit?: number): Promise<SupportKnowledgeResult>;
}

function normalize(value: string): string { return value.toLowerCase().replace(/[^\p{L}\p{N}]/gu, ""); }

const genericTerms = new Set(["怎么", "如何", "什么", "哪些", "哪里", "可以", "能不", "不能", "支持", "我的", "商品"]);
function terms(text: string): string[] {
  const words = new Set<string>();
  for (const segment of text.toLowerCase().match(/[a-z0-9]+|[\u4e00-\u9fff]+/g) || []) {
    if (/^[a-z0-9]+$/.test(segment)) { if (segment.length >= 2) words.add(segment); continue; }
    for (let i = 0; i < segment.length - 1; i += 1) words.add(segment.slice(i, i + 2));
  }
  return [...words].filter(term => !genericTerms.has(term));
}

/** Keep model context separate from the single published answer used on fallback. */
export function rankSupportKnowledge(query: string, articles: SupportKnowledgeArticle[], limit = 6): SupportKnowledgeResult {
  const normalizedQuery = normalize(query);
  if (!normalizedQuery || limit <= 0) return { sources: [], context: "", answer: "" };
  const queryTerms = terms(query);
  const ranked = articles.map(article => {
    const phrases = [article.question, ...article.aliases].map(normalize).filter(Boolean);
    const corpus = [article.title, article.question, ...article.aliases, ...article.keywords, article.category].map(normalize);
    const hits = queryTerms.filter(term => corpus.some(value => value.includes(term))).length;
    const exact = phrases.includes(normalizedQuery);
    const phraseLength = Math.max(0, ...phrases.filter(value => value.length >= 3 && normalizedQuery.includes(value)).map(value => value.length));
    return { article, exact, phraseLength, hits };
  }).filter(item => item.exact || item.phraseLength || item.hits > 0)
    .sort((a, b) => Number(b.exact) - Number(a.exact) || b.phraseLength - a.phraseLength || b.hits - a.hits);
  // An exact standard question/alias needs no loosely related supplementary articles.
  const selected = (ranked[0]?.exact ? ranked.filter(item => item.exact) : ranked).slice(0, limit);
  return {
    sources: selected.map(({ article }) => ({ id: article.id, title: article.title, category: article.category, version: article.version })),
    context: selected.map(({ article }, index) => `知识${index + 1}《${article.title}》\n${article.content}`).join("\n\n"),
    answer: selected[0]?.article.content.trim() || "",
  };
}

export const postgresKnowledgeRetriever: KnowledgeRetriever = {
  async search(query: string, limit = 6): Promise<SupportKnowledgeResult> {
    const articles = await prisma.supportArticle.findMany({
      where: { status: "PUBLISHED" },
      select: { id: true, title: true, question: true, aliases: true, keywords: true, category: true, content: true, version: true },
      orderBy: [{ publishedAt: "desc" }, { updatedAt: "desc" }],
      take: 500,
    });
    return rankSupportKnowledge(query, articles, limit);
  },
};

export async function searchSupportKnowledge(query: string, limit = 6) {
  return postgresKnowledgeRetriever.search(query, limit);
}

export async function getSupportFacts(userId?: string): Promise<SupportFacts> {
  const settings = await getSettings();
  const [products, orders, announcements, paymentMethods] = await Promise.all([
    prisma.product.findMany({
      where: { isActive: true, category: { isActive: true } },
      select: { name: true, slug: true, price: true, stock: true, minQuantity: true, maxQuantity: true, description: true },
      orderBy: [{ sort: "asc" }, { createdAt: "desc" }], take: 50,
    }),
    userId ? prisma.order.findMany({
      where: { userId }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 5,
      select: { orderNo: true, status: true, payAmount: true, createdAt: true, items: { select: { productName: true, quantity: true } } },
    }) : Promise.resolve([]),
    prisma.announcement.findMany({ where: { isActive: true }, orderBy: [{ isPinned: "desc" }, { sort: "asc" }, { createdAt: "desc" }], take: 5, select: { title: true, content: true } }),
    Promise.all(([
      ["WECHAT", "微信支付"], ["ALIPAY", "支付宝"], ["USDT_TRC20", "USDT(TRC20)"], ["BALANCE", "账户余额"],
    ] as const).map(async ([method, label]) => (await isPaymentEnabled(method)) ? label : null)),
  ]);
  const contacts = getPublicContactSettings(settings);
  return {
    siteName: settings.siteName || "AI Shop",
    paymentMethods: paymentMethods.filter((value) => Boolean(value)) as string[],
    products: products.map(product => ({ name: product.name, slug: product.slug, priceCny: product.price / 100, stock: product.stock, minQuantity: product.minQuantity, maxQuantity: product.maxQuantity, description: product.description || "" })),
    orders: orders.map(order => ({ orderNo: order.orderNo, status: order.status, payAmountCny: order.payAmount / 100, createdAt: order.createdAt.toISOString(), items: order.items })),
    contacts,
    announcements,
  };
}

export function factsToPrompt(facts: SupportFacts): string {
  return JSON.stringify(facts, null, 2);
}

