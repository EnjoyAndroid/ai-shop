import prisma from "@/lib/db";
import { transaction } from "@/lib/transaction";
import bcrypt from "bcryptjs";
import { createWithOrderNumber } from "@/lib/order-number";
import { createOrderSchema, type CreateOrderInput } from "@/lib/validations";
import { allocateCardKeys, decryptCardKey } from "./product.service";
import { getOrderExpireMinutes, getOrderAutoDeleteDays } from "./settings.service";
import { sendPaymentSuccessEmail } from "@/lib/mail";
import { sendPaymentSuccessTelegram } from "@/lib/telegram";
import redis, { CACHE_KEYS } from "@/lib/redis";
import { logError } from "@/lib/logger";
import { Prisma, type Order, type PaymentMethod, type OrderStatus } from "@prisma/client";

const orderInclude = { items: { include: { cardKeys: true, product: { select: { id: true, name: true, slug: true } } } } } satisfies Prisma.OrderInclude;
export type OrderWithItems = Prisma.OrderGetPayload<{ include: typeof orderInclude }>;
export interface CreateOrderParams extends CreateOrderInput {
  userId?: string;
  ip?: string; userAgent?: string; fingerprint?: string;
}
export interface PaymentEvidence { method: PaymentMethod; amount: number; }

async function invalidateProducts(order: OrderWithItems): Promise<void> {
  try {
    await redis.del(CACHE_KEYS.PRODUCTS_LIST, ...order.items.map(item => CACHE_KEYS.PRODUCT(item.product.slug)));
  } catch (error) { logError("Invalidate products", error); }
}

async function lockOrder(tx: Prisma.TransactionClient, id: string): Promise<void> {
  await tx.$queryRaw`SELECT id FROM "Order" WHERE id = ${id} FOR UPDATE`;
}

async function updateUserSpent(tx: Prisma.TransactionClient, userId: string, amount: number): Promise<void> {
  const user = await tx.user.update({ where: { id: userId }, data: { totalSpent: { increment: amount } } });
  const level = await tx.userLevel.findFirst({ where: { minSpent: { lte: user.totalSpent } }, orderBy: { minSpent: "desc" } });
  if (level && level.id !== user.levelId) await tx.user.update({ where: { id: userId }, data: { levelId: level.id } });
}

async function fulfill(tx: Prisma.TransactionClient, order: OrderWithItems, paymentNo: string): Promise<OrderWithItems> {
  if (order.items.length === 0) {
    if (!order.userId || order.paymentMethod === "BALANCE") throw new Error("无效的充值订单");
    const user = await tx.user.update({ where: { id: order.userId, status: "ACTIVE" }, data: { balance: { increment: order.payAmount } } });
    await tx.balanceLog.create({ data: { userId: user.id, orderId: order.id, type: "RECHARGE", amount: order.payAmount, balance: user.balance, remark: "余额充值" } });
  } else {
    for (const item of [...order.items].sort((a, b) => a.productId.localeCompare(b.productId))) {
      await allocateCardKeys(item.productId, item.quantity, item.id, tx);
    }
    if (order.userId) await updateUserSpent(tx, order.userId, order.payAmount);
  }
  await tx.paymentQuote.updateMany({ where: { orderId: order.id }, data: { reservation: null } });
  return tx.order.update({ where: { id: order.id }, data: { status: order.items.length ? "DELIVERED" : "COMPLETED", paymentNo, paidAt: new Date() }, include: orderInclude });
}

async function afterPayment(order: OrderWithItems): Promise<void> {
  await invalidateProducts(order);
  if (!order.items.length) return;
  // 外部通知不在资金事务内，失败不重新执行入账或发货。
  if (order.email && process.env.SMTP_HOST && process.env.MAIL_FROM) {
    try {
      await sendPaymentSuccessEmail({ to: order.email, orderNo: order.orderNo, items: order.items.map(item => ({ productName: item.productName, cardKeys: item.cardKeys.map(decryptCardKey) })), totalAmount: order.payAmount });
    } catch (error) { logError("Payment email", error); }
  }
  try {
    await sendPaymentSuccessTelegram({ orderNo: order.orderNo, email: order.email || "", payAmount: order.payAmount, paymentMethod: order.paymentMethod || "BALANCE", items: order.items.map(item => ({ productName: item.productName, quantity: item.quantity, price: item.price })) });
  } catch (error) { logError("Payment notification", error); }
}

export async function createOrder(params: CreateOrderParams): Promise<OrderWithItems> {
  const { userId, ip, userAgent, fingerprint, ...input } = params;
  const { productId, quantity, email, paymentMethod, queryPassword } = createOrderSchema.parse(input);
  if (paymentMethod === "BALANCE" && !userId) throw new Error("请先登录后使用余额支付");
  const queryPasswordHash = await bcrypt.hash(queryPassword, 12);
  const expiredAt = new Date(Date.now() + await getOrderExpireMinutes() * 60000);
  const order = await createWithOrderNumber(orderNo => transaction(async tx => {
    const user = userId ? await tx.user.findUnique({ where: { id: userId, status: "ACTIVE" }, include: { level: true } }) : null;
    if (userId && !user) throw new Error("用户不可用");
    const product = await tx.product.findFirst({ where: { id: productId, isActive: true, category: { isActive: true } } });
    if (!product || quantity < product.minQuantity || quantity > product.maxQuantity) throw new Error("商品不可用或购买数量超限");
    const totalAmount = product.price * quantity;
    const discount = user?.level?.discount ?? 100;
    const payAmount = totalAmount - Math.floor(totalAmount * (100 - discount) / 100);
    if (!Number.isSafeInteger(payAmount) || payAmount < 1 || payAmount > 10000000) throw new Error("订单金额无效");
    const created = await tx.order.create({ data: { orderNo, userId, email, paymentMethod, totalAmount, payAmount, discountAmount: totalAmount - payAmount, queryPasswordHash, expiredAt, ip, userAgent, fingerprint,
      items: { create: { productId, quantity, productName: product.name, price: product.price } } }, include: orderInclude });
    for (const item of created.items) {
      const selected = await tx.$queryRaw<{ id: string }[]>`
        SELECT id FROM "CardKey" WHERE "productId" = ${item.productId} AND status = 'AVAILABLE'
        ORDER BY "createdAt", id LIMIT ${item.quantity} FOR UPDATE SKIP LOCKED`;
      if (selected.length !== item.quantity) throw new Error("库存不足");
      const updated = await tx.cardKey.updateMany({ where: { id: { in: selected.map(key => key.id) }, status: "AVAILABLE" }, data: { status: "LOCKED", orderId: item.id } });
      if (updated.count !== item.quantity) throw new Error("库存已被占用");
      const stock = await tx.cardKey.count({ where: { productId: item.productId, status: "AVAILABLE" } });
      await tx.product.update({ where: { id: item.productId }, data: { stock } });
    }
    if (paymentMethod !== "BALANCE") return created;
    const debited = await tx.user.updateMany({ where: { id: userId!, status: "ACTIVE", balance: { gte: payAmount } }, data: { balance: { decrement: payAmount } } });
    if (debited.count !== 1) throw new Error("余额不足");
    const balance = await tx.user.findUniqueOrThrow({ where: { id: userId! }, select: { balance: true } });
    await tx.balanceLog.create({ data: { userId: userId!, orderId: created.id, type: "CONSUME", amount: -payAmount, balance: balance.balance, remark: `购买商品 ${orderNo}` } });
    const paymentNo = `BALANCE_${orderNo}`;
    await tx.paymentReceipt.create({ data: { orderId: created.id, method: "BALANCE", transactionId: paymentNo, amount: payAmount } });
    return fulfill(tx, created, paymentNo);
  }));
  if (paymentMethod === "BALANCE") await afterPayment(order); else await invalidateProducts(order);
  return order;
}

export async function handlePaymentSuccess(orderNo: string, paymentNo: string, evidence: PaymentEvidence): Promise<OrderWithItems> {
  if (!paymentNo || paymentNo.length > 200 || evidence.method === "BALANCE" || !Number.isSafeInteger(evidence.amount) || evidence.amount <= 0) throw new Error("无效的支付凭据");
  const result = await transaction(async tx => {
    const original = await tx.order.findUnique({ where: { orderNo }, select: { id: true } });
    if (!original) throw new Error("订单不存在");
    await lockOrder(tx, original.id);
    const order = await tx.order.findUniqueOrThrow({ where: { id: original.id }, include: orderInclude });
    if (order.paymentMethod !== evidence.method || order.payAmount !== evidence.amount) throw new Error("支付金额或通道与订单不符");
    const receipt = await tx.paymentReceipt.findUnique({ where: { method_transactionId: { method: evidence.method, transactionId: paymentNo } } });
    if (receipt && receipt.orderId !== order.id) throw new Error("支付流水已被其他订单使用");
    if (["DELIVERED", "COMPLETED", "REFUNDED"].includes(order.status)) {
      if (!receipt || order.paymentNo !== paymentNo) throw new Error("支付流水不匹配");
      return { order, changed: false };
    }
    if (order.status !== "PENDING" || (order.expiredAt && order.expiredAt <= new Date())) throw new Error("订单已取消或过期，请人工核对付款");
    await tx.paymentReceipt.create({ data: { orderId: order.id, method: evidence.method, transactionId: paymentNo, amount: evidence.amount } });
    return { order: await fulfill(tx, order, paymentNo), changed: true };
  });
  if (result.changed) await afterPayment(result.order);
  return result.order;
}

export async function cancelOrder(orderId: string, remark = "订单已取消", expiredOnly = false): Promise<boolean> {
  const order = await transaction(async tx => {
    await lockOrder(tx, orderId);
    const current = await tx.order.findUnique({ where: { id: orderId }, include: orderInclude });
    if (!current || current.status !== "PENDING" || (expiredOnly && (!current.expiredAt || current.expiredAt > new Date()))) return null;
    await tx.order.update({ where: { id: orderId }, data: { status: "CANCELLED", adminRemark: remark } });
    await tx.cardKey.updateMany({ where: { orderId: { in: current.items.map(item => item.id) }, status: "LOCKED" }, data: { status: "AVAILABLE", orderId: null } });
    await tx.paymentQuote.updateMany({ where: { orderId }, data: { reservation: null } });
    for (const item of current.items) {
      const stock = await tx.cardKey.count({ where: { productId: item.productId, status: "AVAILABLE" } });
      await tx.product.update({ where: { id: item.productId }, data: { stock } });
    }
    return current;
  });
  if (order) await invalidateProducts(order);
  return Boolean(order);
}

export async function cancelExpiredOrders(): Promise<number> {
  const orders = await prisma.order.findMany({ where: { status: "PENDING", expiredAt: { lt: new Date() } }, select: { id: true }, take: 100 });
  let count = 0;
  for (const order of orders) if (await cancelOrder(order.id, "订单过期", true)) count++;
  return count;
}

export async function manualDeliver(orderId: string): Promise<OrderWithItems> {
  const order = await transaction(async tx => {
    await lockOrder(tx, orderId);
    const current = await tx.order.findUniqueOrThrow({ where: { id: orderId }, include: orderInclude });
    if (current.status !== "PAID") throw new Error("只有已支付订单可以发货");
    if (!current.items.length) throw new Error("充值订单不支持手动发货");
    for (const item of current.items) await allocateCardKeys(item.productId, item.quantity, item.id, tx);
    return tx.order.update({ where: { id: orderId }, data: { status: "DELIVERED" }, include: orderInclude });
  });
  await afterPayment(order);
  return order;
}

export async function refundOrder(orderId: string, adminRemark = "管理员手动退款"): Promise<Order> {
  return transaction(async tx => {
    await lockOrder(tx, orderId);
    const order = await tx.order.findUniqueOrThrow({ where: { id: orderId } });
    if (!["PAID", "DELIVERED"].includes(order.status)) throw new Error("订单状态不支持退款");
    // 外部支付只记录人工退款结果；该操作不会调用第三方退款接口。
    if (order.paymentMethod === "BALANCE" && order.userId) {
      const user = await tx.user.update({ where: { id: order.userId }, data: { balance: { increment: order.payAmount } } });
      await tx.balanceLog.create({ data: { userId: user.id, orderId, type: "REFUND", amount: order.payAmount, balance: user.balance, remark: adminRemark } });
    }
    return tx.order.update({ where: { id: orderId }, data: { status: "REFUNDED", adminRemark } });
  });
}

export async function adjustUserBalance(userId: string, amount: number, remark: string): Promise<number> {
  if (!Number.isSafeInteger(amount) || amount === 0 || Math.abs(amount) > 10000000) throw new Error("无效的调整金额");
  return transaction(async tx => {
    const changed = await tx.user.updateMany({ where: { id: userId, balance: amount < 0 ? { gte: -amount } : { lte: 2147483647 - amount } }, data: { balance: { increment: amount } } });
    if (changed.count !== 1) throw new Error("用户不存在、余额不足或余额超限");
    const user = await tx.user.findUniqueOrThrow({ where: { id: userId } });
    await tx.balanceLog.create({ data: { userId, amount, balance: user.balance, type: "ADJUST", remark } });
    return user.balance;
  });
}

export async function getUserOrders(userId: string, options: { page?: number; limit?: number; status?: OrderStatus } = {}): Promise<{ orders: Order[]; total: number }> {
  const { page = 1, limit = 10, status } = options;
  const where = { userId, ...(status && { status }) };
  const [orders, total] = await Promise.all([
    prisma.order.findMany({ where, include: { items: { include: { product: { select: { id: true, name: true, slug: true } } } } }, orderBy: { createdAt: "desc" }, skip: (page - 1) * limit, take: limit }),
    prisma.order.count({ where }),
  ]);
  return { orders, total };
}

export function getOrderCardKeys(order: OrderWithItems) {
  return order.items.map(item => ({ productName: item.productName, cardKeys: item.cardKeys.map(decryptCardKey) }));
}

export async function deleteOldOrders(): Promise<number> {
  const cutoff = new Date(Date.now() - await getOrderAutoDeleteDays() * 86400000);
  // 财务和已售卡密关联记录保留供审计；仅清理没有关联敏感记录的取消订单。
  const result = await prisma.order.deleteMany({ where: { status: "CANCELLED", createdAt: { lt: cutoff }, balanceLogs: { none: {} }, paymentLogs: { none: {} }, items: { every: { cardKeys: { none: {} } } } } });
  return result.count;
}
