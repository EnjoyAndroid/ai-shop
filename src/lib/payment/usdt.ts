import { randomInt } from "crypto";
import { Prisma } from "@prisma/client";
import prisma from "@/lib/db";
import { transaction } from "@/lib/transaction";
import { getUSDTRate } from "@/lib/exchange-rate";
import { getTRC20Transfers, isMatchingTransfer } from "@/lib/trongrid";
import type { QueryResult } from "./index";

export async function getOrCreateQuote(orderNo: string, expectedCents: number) {
  const existing = await prisma.paymentQuote.findFirst({ where: { order: { orderNo } } });
  if (existing) {
    if (existing.expiresAt <= new Date() || !existing.reservation) throw new Error("支付报价已失效");
    return existing;
  }
  const address = process.env.USDT_TRC20_ADDRESS || "";
  if (!/^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(address)) throw new Error("未配置有效的 USDT 收款地址");
  const { rate } = await getUSDTRate();
  if (!Number.isFinite(rate) || rate <= 0) throw new Error("汇率不可用");
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      return await transaction(async tx => {
        const order = await tx.order.findUniqueOrThrow({ where: { orderNo } });
        await tx.$queryRaw`SELECT id FROM "Order" WHERE id = ${order.id} FOR UPDATE`;
        const saved = await tx.paymentQuote.findUnique({ where: { orderId: order.id } });
        if (saved) return saved;
        if (order.status !== "PENDING" || order.paymentMethod !== "USDT_TRC20" || order.payAmount !== expectedCents || !order.expiredAt || order.expiredAt <= new Date()) throw new Error("订单不允许创建支付报价");
        await tx.paymentQuote.updateMany({ where: { expiresAt: { lte: new Date() }, reservation: { not: null } }, data: { reservation: null } });
        const centsInUSDT = Math.ceil(expectedCents / rate);
        const amountMicros = BigInt(centsInUSDT) * BigInt(10000) + BigInt(randomInt(1, 10000));
        const reservation = `USDT_TRC20:${address}:${amountMicros}`;
        return tx.paymentQuote.create({ data: { orderId: order.id, method: "USDT_TRC20", address, amountMicros, exchangeRate: rate, expiresAt: order.expiredAt, reservation } });
      });
    } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002" || attempt === 4) throw error;
    }
  }
  throw new Error("无法创建支付报价");
}

export async function queryUSDTPayment(orderNo: string): Promise<QueryResult> {
  const quote = await prisma.paymentQuote.findFirst({ where: { order: { orderNo, status: "PENDING" } } });
  // 历史订单没有持久化报价时不猜测金额，交由人工核对。
  if (!quote || !quote.reservation || quote.expiresAt <= new Date()) return { success: false, status: "pending", errorMsg: "支付报价不存在或已过期" };
  const transfers = await getTRC20Transfers(quote.address, { minTimestamp: quote.createdAt.getTime(), maxTimestamp: quote.expiresAt.getTime() });
  for (const transfer of transfers) {
    if (!isMatchingTransfer(transfer, quote)) continue;
    const used = await prisma.paymentReceipt.findUnique({ where: { method_transactionId: { method: "USDT_TRC20", transactionId: transfer.transaction_id } } });
    if (!used) return { success: true, status: "paid", tradeNo: transfer.transaction_id };
  }
  return { success: true, status: "pending" };
}
