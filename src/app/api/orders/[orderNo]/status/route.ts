import { NextRequest } from "next/server";
import { accessibleOrder, orderError, orderJson } from "@/lib/order-http";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest, { params }: { params: Promise<{ orderNo: string }> }) {
  try {
    const order = await accessibleOrder(request, (await params).orderNo, "order-status");
    return orderJson({ status: order.status, expiredAt: order.expiredAt, paid: ["PAID", "DELIVERED", "COMPLETED"].includes(order.status) });
  } catch (error) { return orderError("Order status", error); }
}
