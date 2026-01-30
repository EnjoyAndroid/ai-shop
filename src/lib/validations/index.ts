import { z } from "zod";

// ==================== 用户验证 ====================

export const registerSchema = z.object({
  email: z.string().email("请输入有效的邮箱地址").optional(),
  phone: z
    .string()
    .regex(/^1[3-9]\d{9}$/, "请输入有效的手机号")
    .optional(),
  password: z.string().min(6, "密码至少6位").max(32, "密码最多32位"),
  name: z.string().min(2, "昵称至少2个字符").max(20, "昵称最多20个字符").optional(),
}).refine(data => data.email || data.phone, {
  message: "邮箱和手机号至少填写一个",
});

export const loginSchema = z.object({
  account: z.string().min(1, "请输入邮箱或手机号"),
  password: z.string().min(1, "请输入密码"),
});

// ==================== 商品验证 ====================

export const productSchema = z.object({
  name: z.string().min(1, "商品名称不能为空").max(100),
  slug: z.string().min(1, "Slug不能为空").max(100).regex(/^[a-z0-9-]+$/, "Slug只能包含小写字母、数字和连字符"),
  description: z.string().max(500).optional(),
  content: z.string().optional(),
  image: z.string().nullable().optional(),
  categoryId: z.string().min(1, "请选择分类"),
  price: z.number().min(1, "价格必须大于0"),
  originalPrice: z.number().min(0).optional(),
  isActive: z.boolean().default(true),
  sort: z.number().default(0),
  minQuantity: z.number().min(1).default(1),
  maxQuantity: z.number().min(1).default(10),
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
  items: z.array(z.object({
    productId: z.string().min(1),
    quantity: z.number().min(1).max(100),
  })).min(1, "请选择商品"),
  email: z.string().email("请输入有效的邮箱地址").optional(),
  phone: z.string().regex(/^1[3-9]\d{9}$/, "请输入有效的手机号").optional(),
  paymentMethod: z.enum(["ALIPAY", "WECHAT", "USDT_TRC20", "USDT_ERC20", "BALANCE"]),
}).refine(data => data.email || data.phone, {
  message: "邮箱和手机号至少填写一个，用于接收卡密",
});

export const queryOrderSchema = z.object({
  orderNo: z.string().min(1, "请输入订单号"),
  password: z.string().min(1, "请输入查询密码"),
});

// ==================== 卡密验证 ====================

export const importCardKeysSchema = z.object({
  productId: z.string().min(1, "请选择商品"),
  cardKeys: z.string().min(1, "请输入卡密内容"),
  batchNo: z.string().optional(),
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
export type QueryOrderInput = z.infer<typeof queryOrderSchema>;
export type ImportCardKeysInput = z.infer<typeof importCardKeysSchema>;
export type AdminLoginInput = z.infer<typeof adminLoginSchema>;
export type AdjustBalanceInput = z.infer<typeof adjustBalanceSchema>;
