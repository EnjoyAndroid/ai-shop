import { modelToolResult } from './ui';
import { SupportToolError, type ProductQuery } from './tool-contract';
import type { SupportKnowledgeArticle } from './retriever';

export const TOOL_RESULT_MAX_BYTES = 6000;
export const toolResultBytes = (value: unknown) => Buffer.byteLength(JSON.stringify(value) || 'null', 'utf8');
export function boundedSupportResult(value: unknown): unknown {
  return toolResultBytes(value) <= TOOL_RESULT_MAX_BYTES ? value
    : { error: 'RESULT_TOO_LARGE', message: '本次资料超过容量，内容尚不可用；请缩小查询范围或使用分页，不能据此判断没有结果。' };
}

export interface ProductToolRow {
  name: string; slug: string; price: number; stock: number;
  minQuantity: number; maxQuantity: number; description: string | null;
}
export const normalizeProductName = (value: string) => value.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '').replace(/chatgpt/g, 'gpt');
export function productNameMatches(name: string, query: string) {
  const normalized = normalizeProductName(query);
  return Boolean(normalized) && normalizeProductName(name).includes(normalized);
}

/** Rows are already filtered and ordered, including one lookahead row. Never
 * drop a product's description qualifiers merely to fit another list item. */
export function buildProductToolPage(rows: ProductToolRow[], args: ProductQuery, queriedAt = new Date().toISOString()) {
  const candidates = rows.slice(0, args.limit).map(p => ({ productRef: p.slug, name: p.name,
    url: `/product/${encodeURIComponent(p.slug)}`, priceCny: p.price / 100, stock: p.stock,
    minQuantity: p.minQuantity, maxQuantity: p.maxQuantity, description: p.description || '' }));
  const makePage = (count: number) => {
    const products = candidates.slice(0, count), truncated = rows.length > count;
    return { queriedAt, query: args.query, filters: { minPriceCny: args.minPriceCny, maxPriceCny: args.maxPriceCny, inStockOnly: args.inStockOnly },
      exactMatches: products.filter(p => productNameMatches(p.name, args.query)),
      relatedProducts: products.filter(p => !productNameMatches(p.name, args.query)),
      truncated, returned: count, nextOffset: truncated ? args.offset + count : null };
  };
  let count = candidates.length;
  while (count && toolResultBytes(modelToolResult('search_products', makePage(count))) > TOOL_RESULT_MAX_BYTES) count--;
  if (!count && candidates.length) throw new SupportToolError('RESULT_TOO_LARGE', '单件商品资料超过容量，无法完整核实，请使用商品详情页面或联系人工。');
  return makePage(count);
}

type Article = Pick<SupportKnowledgeArticle, 'id' | 'title' | 'category' | 'version' | 'content'>;
/** Lossless original-text pages. Prefer paragraph/sentence boundaries; expose
 * exact offsets even for a single oversized paragraph, never summarize policy. */
export function buildKnowledgePage(article: Article, cursor = 0, maxBytes = TOOL_RESULT_MAX_BYTES) {
  if (cursor > article.content.length || (cursor > 0 && /[\uDC00-\uDFFF]/.test(article.content[cursor] || ''))) {
    throw new SupportToolError('INVALID_ARGUMENTS', 'cursor无效，请使用上次返回的nextCursor，或从0开始读取。');
  }
  const makePage = (end: number) => ({ articleId: article.id, title: article.title, category: article.category, version: article.version,
    content: article.content.slice(cursor, end), start: cursor, end,
    contentComplete: cursor === 0 && end === article.content.length,
    nextCursor: end < article.content.length ? end : null });
  let low = cursor, high = article.content.length;
  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    if (toolResultBytes(makePage(middle)) <= maxBytes) low = middle; else high = middle - 1;
  }
  let end = low;
  if (end < article.content.length) {
    if (/[\uDC00-\uDFFF]/.test(article.content[end] || '')) end--;
    const portion = article.content.slice(cursor, end);
    const paragraph = portion.lastIndexOf('\n\n');
    const sentence = Math.max(portion.lastIndexOf('。'), portion.lastIndexOf('！'), portion.lastIndexOf('？'), portion.lastIndexOf('\n'));
    const boundary = paragraph >= portion.length / 2 ? paragraph + 2 : sentence >= portion.length / 2 ? sentence + 1 : 0;
    if (boundary) end = cursor + boundary;
  }
  if (end === cursor && cursor < article.content.length) throw new SupportToolError('RESULT_TOO_LARGE', '知识元数据超过容量，请缩小检索或联系人工核实。');
  return makePage(end);
}

export function buildKnowledgeSearchResult(articles: Article[]) {
  // Leave room for the envelope. All selected titles/references survive; each
  // excerpt is a contiguous prefix with an explicit continuation, not a summary.
  const allowance = Math.floor((TOOL_RESULT_MAX_BYTES - 300) / Math.max(1, articles.length));
  const pages = articles.map(article => buildKnowledgePage(article, 0, allowance));
  return { articles: pages, truncated: pages.some(page => !page.contentComplete),
    guidance: 'contentComplete=false表示部分原文；用read_knowledge_article和nextCursor连续补读到末尾。不得仅凭不完整资料承诺退款或断言没有例外。' };
}
