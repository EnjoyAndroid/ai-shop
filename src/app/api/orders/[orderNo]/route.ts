import { NextRequest } from "next/server";
import prisma from "@/lib/db";
import { decryptCardKey } from "@/lib/services/product.service";
import { accessibleOrder, orderError, orderJson } from "@/lib/order-http";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest, { params }: { params: Promise<{ orderNo: string }> }) {
  try {
    const accessible = await accessibleOrder(request, (await params).orderNo, "order-detail");
    const order = await prisma.order.findUniqueOrThrow({
      where: { id: accessible.id },
      select: {
        id: true, orderNo: true, email: true, totalAmount: true, discountAmount: true, payAmount: true,
        paymentMethod: true, status: true, createdAt: true, paidAt: true, expiredAt: true,
        items: { select: {
          id: true, productName: true, price: true, quantity: true,
          product: { select: { id: true, name: true, slug: true } },
          cardKeys: { take: 100, orderBy: { createdAt: "asc" }, select: { id: true, content: true, iv: true, tag: true } },
        } },
      },
    });
    return orderJson({ order: { ...order, items: order.items.map(item => ({
      ...item, cardKeys: ["PAID", "DELIVERED", "COMPLETED"].includes(order.status)
        ? item.cardKeys.map(key => ({ id: key.id, content: decryptCardKey(key) })) : [],
    })) } });
  } catch (error) { return orderError("Order detail", error); }
}
