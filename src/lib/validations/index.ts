import { z } from "zod";
import { orderEmailSchema, orderPasswordSchema } from "../order-rules";
import { userPasswordSchema } from "../password-rules";
import { cardKeyBatchSchema, cardKeyImportTextSchema } from "../cardkey-rules";

// ==================== 用户验证 ====================

export const registerSchema = z.object({
  email: z.string().trim().toLowerCase().email("请输入有效的邮箱地址").max(254),
  password: userPasswordSchema,
});
export const loginSchema = z.object({ account: z.string().trim().toLowerCase().email(), password: z.string().min(1).max(72) });

// ==================== 商品验证 ====================

export const productSchema = z.object({
  name: z.string().min(1, "商品名称不能为空").max(100),
  slug: z.string().min(1, "Slug不能为空").max(100).regex(/^[a-z0-9-]+$/, "Slug只能包含小写字母、数字和连字符"),
  description: z.string().max(500).optional(),
  content: z.string().optional(),
  image: z.string().nullable().optional(),
  categoryId: z.string().min(1, "请选择分类"),
  price: z.number().int().min(1, "价格必须大于0").max(10000000),
  originalPrice: z.number().int().min(0).max(10000000).nullable().optional(),
  isActive: z.boolean().default(true),
  sort: z.number().default(0),
  minQuantity: z.number().int().min(1).max(100).default(1),
  maxQuantity: z.number().int().min(1).max(100).default(10),
});

export const categorySchema = z.object({
  name: z.string().min(1, "分类名称不能为空").max(50),
  slug: z.string().min(1, "Slug不能为空").max(50).regex(/^[a-z0-9-]+$/, "Slug只能包含小写字母、数字和连字符"),
  description: z.string().max(200).optional(),
  icon: z.string().max(100).optional(),
  isActive: z.boolean().default(true),
  sort: z.number().default(0),
});

// ==================== 订单验证 ====================

export const createOrderSchema = z.object({
  productId: z.string().min(1, "请选择商品"),
  quantity: z.number().int().min(1).max(100),
  email: orderEmailSchema,
  queryPassword: orderPasswordSchema,
  paymentMethod: z.enum(["ALIPAY", "WECHAT", "USDT_TRC20", "USDT_ERC20", "BALANCE"]),
}).strict();

// ==================== 卡密验证 ====================

export const importCardKeysSchema = z.object({
  productId: z.string().min(1, "请选择商品"),
  cardKeys: cardKeyImportTextSchema,
  batchNo: cardKeyBatchSchema.optional(),
});

// ==================== 支付验证 ====================

export const paymentCallbackSchema = z.object({
  orderNo: z.string(),
  tradeNo: z.string(),
  amount: z.number(),
  status: z.string(),
  sign: z.string(),
});

// ==================== 管理员验证 ====================

export const adminLoginSchema = z.object({
  username: z.string().min(1, "请输入用户名"),
  password: z.string().min(1, "请输入密码"),
});

export const adjustBalanceSchema = z.object({
  userId: z.string().min(1),
  amount: z.number(),
  remark: z.string().max(200).optional(),
});

// 类型导出
export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type ProductInput = z.infer<typeof productSchema>;
export type CategoryInput = z.infer<typeof categorySchema>;
export type CreateOrderInput = z.infer<typeof createOrderSchema>;
export type ImportCardKeysInput = z.infer<typeof importCardKeysSchema>;
export type AdminLoginInput = z.infer<typeof adminLoginSchema>;
export type AdjustBalanceInput = z.infer<typeof adjustBalanceSchema>;
