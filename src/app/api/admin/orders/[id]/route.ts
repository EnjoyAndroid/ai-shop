import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { allocateCardKeys, decryptCardKey } from "@/lib/services/product.service";

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const order = await prisma.order.findUnique({
      where: { id: params.id },
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
      ...order,
      items: order.items.map((item) => ({
        ...item,
        cardKeys: item.cardKeys.map((ck) => ({
          id: ck.id,
          content: decryptCardKey(ck),
        })),
      })),
    };

    return NextResponse.json({ order: orderWithDecryptedKeys });
  } catch (error) {
    console.error("Get order error:", error);
    return NextResponse.json({ error: "获取订单失败" }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { action, remark } = await request.json();

    const order = await prisma.order.findUnique({
      where: { id: params.id },
      include: {
        items: true,
      },
    });

    if (!order) {
      return NextResponse.json({ error: "订单不存在" }, { status: 404 });
    }

    let updatedOrder;

    switch (action) {
      case "deliver":
        // 手动发货
        if (order.status !== "PAID") {
          return NextResponse.json(
            { error: "只有已支付订单可以发货" },
            { status: 400 }
          );
        }

        // 分配卡密
        for (const item of order.items) {
          await allocateCardKeys(item.productId, item.quantity, item.id);
        }

        updatedOrder = await prisma.order.update({
          where: { id: params.id },
          data: { status: "DELIVERED" },
          include: {
            items: {
              include: { cardKeys: true },
            },
            user: {
              select: { id: true, email: true, name: true },
            },
          },
        });
        break;

      case "refund":
        // 退款
        if (!["PAID", "DELIVERED"].includes(order.status)) {
          return NextResponse.json(
            { error: "该订单状态不支持退款" },
            { status: 400 }
          );
        }

        updatedOrder = await prisma.order.update({
          where: { id: params.id },
          data: {
            status: "REFUNDED",
            adminRemark: remark || "管理员手动退款",
          },
          include: {
            items: {
              include: { cardKeys: true },
            },
            user: {
              select: { id: true, email: true, name: true },
            },
          },
        });

        // 如果是余额支付，退回余额
        if (order.paymentMethod === "BALANCE" && order.userId) {
          await prisma.user.update({
            where: { id: order.userId },
            data: {
              balance: { increment: order.payAmount },
            },
          });
        }
        break;

      case "cancel":
        // 取消订单
        if (order.status !== "PENDING") {
          return NextResponse.json(
            { error: "只有待支付订单可以取消" },
            { status: 400 }
          );
        }

        updatedOrder = await prisma.order.update({
          where: { id: params.id },
          data: {
            status: "CANCELLED",
            adminRemark: remark || "管理员手动取消",
          },
          include: {
            items: {
              include: { cardKeys: true },
            },
            user: {
              select: { id: true, email: true, name: true },
            },
          },
        });
        break;

      default:
        return NextResponse.json({ error: "无效的操作" }, { status: 400 });
    }

    // 解密卡密
    const orderWithDecryptedKeys = {
      ...updatedOrder,
      items: updatedOrder.items.map((item) => ({
        ...item,
        cardKeys: item.cardKeys.map((ck) => ({
          id: ck.id,
          content: decryptCardKey(ck),
        })),
      })),
    };

    return NextResponse.json({ order: orderWithDecryptedKeys });
  } catch (error) {
    console.error("Order action error:", error);
    return NextResponse.json({ error: "操作失败" }, { status: 500 });
  }
}
