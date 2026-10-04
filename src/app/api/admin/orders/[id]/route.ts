import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { withoutOrderPassword } from "@/lib/order-public";
import { decryptCardKey } from "@/lib/services/product.service";
import { getAdminSession, hasAdminPermission } from "@/lib/admin-auth";
import { cancelOrder, manualDeliver, refundOrder } from "@/lib/services/order.service";
import { logError } from "@/lib/logger";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await getAdminSession();
  if (!admin) {
    return NextResponse.json({ error: "未授权" }, { status: 401 });
  }

  try {
    const order = await prisma.order.findUnique({
      where: { id: (await params).id },
      include: {
        items: {
          include: {
            cardKeys: true,
          },
        },
        user: {
          select: { id: true, email: true, name: true },
        },
      },
    });

    if (!order) {
      return NextResponse.json({ error: "订单不存在" }, { status: 404 });
    }

    // 解密卡密
    const orderWithDecryptedKeys = {
      ...withoutOrderPassword(order),
      items: order.items.map((item) => ({
        ...item,
        cardKeys: item.cardKeys.map((ck) => ({
          id: ck.id,
          content: decryptCardKey(ck),
        })),
      })),
    };

    return NextResponse.json({ order: orderWithDecryptedKeys }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    logError("Get order", error);
    return NextResponse.json({ error: "获取订单失败" }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await getAdminSession();
  if (!admin) {
    return NextResponse.json({ error: "未授权" }, { status: 401 });
  }

  try {
    const { action, remark } = await request.json();

    const order = await prisma.order.findUnique({
      where: { id: (await params).id },
      include: {
        items: true,
      },
    });

    if (!order) {
      return NextResponse.json({ error: "订单不存在" }, { status: 404 });
    }

    if (action === "refund" && !hasAdminPermission(admin, "finance")) return NextResponse.json({ error: "无权限" }, { status: 403 });
    if (remark && (typeof remark !== "string" || remark.length > 200)) return NextResponse.json({ error: "备注无效" }, { status: 400 });
    if (action === "deliver") await manualDeliver(order.id);
    else if (action === "refund") await refundOrder(order.id, remark);
    else if (action === "cancel") {
      if (!await cancelOrder(order.id, remark)) return NextResponse.json({ error: "订单状态不允许取消" }, { status: 400 });
    } else return NextResponse.json({ error: "无效的操作" }, { status: 400 });
    const updatedOrder = await prisma.order.findUniqueOrThrow({ where: { id: order.id }, include: { items: { include: { cardKeys: true } }, user: { select: { id: true, email: true, name: true } } } });

    // 解密卡密
    const orderWithDecryptedKeys = {
      ...withoutOrderPassword(updatedOrder),
      items: updatedOrder.items.map((item) => ({
        ...item,
        cardKeys: item.cardKeys.map((ck) => ({
          id: ck.id,
          content: decryptCardKey(ck),
        })),
      })),
    };

    return NextResponse.json({ order: orderWithDecryptedKeys }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    logError("Order action", error);
    return NextResponse.json({ error: "操作失败" }, { status: 500 });
  }
}
