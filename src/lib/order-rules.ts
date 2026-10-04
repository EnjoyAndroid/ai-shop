import { z } from "zod";

export const ORDER_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
export const PRODUCT_ORDER_PATTERN = /^AS[0-9A-HJKMNP-TV-Z]{20}$/;
export const ORDER_PATTERN = /^R?AS[0-9A-HJKMNP-TV-Z]{20}$/;
export const orderEmailSchema = z.string().trim().toLowerCase().email("请输入有效的邮箱地址").max(254);
export const orderPasswordSchema = z.string()
  .min(8, "查询密码至少8位")
  .max(72, "查询密码最多72个字节")
  .refine(value => value.trim().length > 0, "查询密码不能全为空白")
  .refine(value => new TextEncoder().encode(value).length <= 72, "查询密码最多72个字节（中文通常占3个字节）");

export const orderKeywordSchema = z.string().trim().min(1, "请输入下单邮箱或订单号").max(254)
  .transform(value => value.includes("@") ? value.toLowerCase() : value.toUpperCase())
  .refine(value => orderEmailSchema.safeParse(value).success || PRODUCT_ORDER_PATTERN.test(value), "请输入有效的下单邮箱或商品订单号");

export const orderFilterSchema = z.enum(["ALL", "PENDING", "PAID", "REFUNDED"]);
export type OrderFilter = z.infer<typeof orderFilterSchema>;
export interface OrderSummary {
  orderNo: string;
  createdAt: string;
  payAmount: number;
  status: string;
  items: { productName: string; quantity: number }[];
}
export interface OrderSearchResult {
  orders: OrderSummary[];
  total: number;
  page: number;
  pageSize: number;
  queryToken: string;
}
