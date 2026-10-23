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

export interface KnowledgeRetriever {
  search(query: string, limit?: number): Promise<{ sources: SupportSource[]; context: string }>;
}

function terms(text: string): string[] {
  const normalized = text.toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
  const words = new Set<string>();
  for (const match of text.toLowerCase().match(/[a-z0-9]{2,}|[\u4e00-\u9fff]/g) || []) words.add(match);
  for (let i = 0; i < normalized.length - 1; i += 1) words.add(normalized.slice(i, i + 2));
  return [...words].filter(Boolean);
}

export const postgresKnowledgeRetriever: KnowledgeRetriever = {
  async search(query: string, limit = 6): Promise<{ sources: SupportSource[]; context: string }> {
  const articles = await prisma.supportArticle.findMany({
    where: { status: "PUBLISHED" },
    select: { id: true, title: true, question: true, aliases: true, keywords: true, category: true, content: true, version: true },
    orderBy: [{ publishedAt: "desc" }, { updatedAt: "desc" }],
    take: 500,
  });
  const queryTerms = terms(query);
  const ranked = articles.map(article => {
    const corpus = [article.title, article.question, ...article.aliases, ...article.keywords, article.category].join(" ").toLowerCase();
    const hits = queryTerms.reduce((count, term) => count + (corpus.includes(term) ? 1 : 0), 0);
    const exact = [article.question, ...article.aliases].some(value => value.toLowerCase() === query.toLowerCase().trim()) ? 8 : 0;
    return { article, score: hits + exact };
  }).filter(item => item.score > 0).sort((a, b) => b.score - a.score).slice(0, limit);
  return {
    sources: ranked.map(({ article }) => ({ id: article.id, title: article.title, category: article.category, version: article.version })),
    context: ranked.map(({ article }, index) => `知识${index + 1}《${article.title}》\n${article.content}`).join("\n\n"),
  };
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

