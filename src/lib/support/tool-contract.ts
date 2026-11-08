import { z } from 'zod';
import { supportPages, type SupportPage } from './ui';

const price = z.number().min(0).max(100000).multipleOf(0.01).nullable().default(null);
export const productQuerySchema = z.object({
  query: z.string().trim().max(200).describe('商品名称、型号或品牌；预算/用途不是名称。未点名商品时传空字符串。'),
  minPriceCny: price.describe('当前商品单价下限，人民币元，含边界；不限制用null。不是月费或订单总价。'),
  maxPriceCny: price.describe('当前商品单价上限，人民币元，含边界；不限制用null。'),
  inStockOnly: z.boolean().default(false).describe('只找有货的可选商品时为true；核实指定商品是否缺货时为false。'),
  limit: z.number().int().min(1).max(20).default(5).describe('每页最多条数，通常用5；实际返回可能因容量减少。'),
  offset: z.number().int().min(0).max(100000).default(0).describe('第一页用0；翻页保持其他条件不变，使用返回的nextOffset。'),
}).strict().refine(a => a.minPriceCny === null || a.maxPriceCny === null || a.minPriceCny <= a.maxPriceCny,
  { path: ['maxPriceCny'], message: '价格上限不能小于下限' });
const querySchema = z.object({ query: z.string().trim().max(200).describe('商城政策、购买步骤或使用故障，保留商品和问题要点；不查询实时价格或库存。') }).strict();
export const articleReadSchema = z.object({
  articleId: z.string().min(1).max(80).describe('search_knowledge返回的articleId。'),
  version: z.number().int().min(1).describe('检索返回的版本；变化后重新检索，不能混用版本。'),
  cursor: z.number().int().min(0).max(20000).default(0).describe('搜索已提供正文前缀时，直接使用其nextCursor继续；仅未读过正文时用0。不重复已读前缀，不跳过中间条件。'),
}).strict();
const empty = z.object({}).strict();
const definitions = {
  search_products: { schema: productQuerySchema, description: '查当前上架商品、描述中的功能/用途、单价和库存。询问某商品适合什么或能否完成某用途时先查该商品描述，知识库仅补充政策和操作。先筛选后分页；exactMatches仅为名称匹配，relatedProducts不能当作指定型号。预算推荐例如query为空、maxPriceCny=100、inStockOnly=true。truncated不是全店无货，按nextOffset续查。minQuantity/maxQuantity为单笔订单的数量范围，不是每人累计限购。' },
  search_knowledge: { schema: querySchema, description: '搜索已发布的购买步骤、使用故障、售后及账户政策；商品用途/能力先查search_products的描述，不能只查通用知识就判断没有商品资料。不提供实时价格。articles包含原文和版本；contentComplete=false只是部分资料，需用read_knowledge_article补读，不能仅凭摘录承诺退款或断言功能。' },
  read_knowledge_article: { schema: articleReadSchema, description: '按检索引用补读已发布知识原文。保持articleId和version，依次使用nextCursor直到null，完整核实须覆盖从0到末尾的全部原文。版本变化应重新搜索；未读完不得把未见的例外条件当作不存在。' },
  get_payment_methods: { schema: empty, description: '查本轮实际启用的支付方式。' },
  get_my_orders: { schema: empty, description: '读取已登录账号最近5笔订单摘要；游客返回免登录查询页面指引。无需且不接受userId。只问在哪里查订单时用get_navigation。' },
  get_contacts: { schema: empty, description: '需要人工时查询当前公开渠道；只提供联系指引，不发送消息、不建工单、不转接。' },
  get_navigation: { schema: z.object({ page: z.enum(Object.keys(supportPages) as [SupportPage, ...SupportPage[]]) }).strict(), description: '返回站内页面按钮，不执行购买或支付。通用订单查询选order_query，无需账户登录；游客my_orders自动转公共查询。不接受URL。' },
  get_announcements: { schema: empty, description: '查当前公开公告。' },
} as const;

export type SupportToolName = keyof typeof definitions;
export type SupportToolArguments = Record<string, string | number | boolean | null>;
export type ProductQuery = z.infer<typeof productQuerySchema>;

export class SupportToolError extends Error {
  constructor(public code: string, message: string) { super(message); }
}

// Provider strict schemas require every field. Server defaults also accept old
// internal callers; the same Zod contract validates both planner and follow-ups.
export const supportTools = Object.entries(definitions).map(([name, definition]) => {
  const parameters = z.toJSONSchema(definition.schema, { io: 'input' });
  delete parameters.$schema;
  parameters.required = Object.keys(parameters.properties || {});
  for (const property of Object.values(parameters.properties || {})) if (typeof property === 'object') delete property.default;
  return { type: 'function' as const, strict: true, name, description: definition.description, parameters };
});

export function validateSupportTool(name: string, raw: unknown): SupportToolArguments {
  if (!Object.hasOwn(definitions, name)) throw new SupportToolError('UNKNOWN_TOOL', '工具不存在；请使用提供的只读工具，不能执行购买、退款或修改账户。');
  return definitions[name as SupportToolName].schema.parse(raw);
}

export function supportToolFailure(error: unknown) {
  if (error instanceof SupportToolError) return { error: error.code, message: error.message };
  if (error instanceof z.ZodError) return { error: 'INVALID_ARGUMENTS', message: '参数无效；请按工具定义修改字段、类型和范围后查询。',
    fields: [...new Set(error.issues.map(issue => issue.path.join('.')).filter(Boolean))] };
  if (error instanceof SyntaxError) return { error: 'INVALID_ARGUMENTS', message: '参数必须是合法JSON对象，请按工具定义重新填写。' };
  return { error: 'QUERY_FAILED', message: '查询暂时失败，当前事实未知；不能当作无商品或无订单。请稍后重试，不重复相同查询。' };
}
