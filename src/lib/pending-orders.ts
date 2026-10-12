import { isIP } from "node:net";
import { Prisma } from "@prisma/client";
import { OrderRequestError } from "./order-errors";

function positiveLimit(name: string, fallback: number): number {
  const value = process.env[name];
  if (value === undefined || value === "") return fallback;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > 10000) throw new Error(`${name} 必须为1至10000的整数`);
  return parsed;
}

export function pendingOrderLimits() {
  return { orders: positiveLimit("MAX_PENDING_ORDERS", 3), quantity: positiveLimit("MAX_PENDING_QUANTITY", 100) };
}

// Must run in the same SERIALIZABLE transaction that reserves inventory. Reads
// participate in PostgreSQL conflict detection, including concurrent new orders.
export async function enforcePendingOrderLimits(
  tx: Prisma.TransactionClient,
  buyer: { userId?: string; email: string; ip?: string },
  quantity: number,
  limits = pendingOrderLimits(),
) {
  const identities: Prisma.OrderWhereInput[] = [{ email: buyer.email }];
  if (buyer.userId) identities.push({ userId: buyer.userId });
  // "direct"/"unknown" are shared placeholders, not individual visitors.
  if (process.env.TRUST_PROXY === "true" && buyer.ip && isIP(buyer.ip)) identities.push({ ip: buyer.ip });
  for (const identity of identities) {
    const where: Prisma.OrderWhereInput = { ...identity, status: "PENDING", items: { some: {} } };
    const count = await tx.order.count({ where });
    const reserved = await tx.orderItem.aggregate({ where: { order: where }, _sum: { quantity: true } });
    if (count >= limits.orders || (reserved._sum.quantity || 0) + quantity > limits.quantity) {
      throw new OrderRequestError("待付款订单或商品数量已达上限，请先完成付款或等待订单取消", 429, "PENDING_ORDER_LIMIT");
    }
  }
}
