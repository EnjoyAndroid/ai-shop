import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { withoutOrderPassword } from "@/lib/order-public";
import { getAdminSession } from "@/lib/admin-auth";
import { logError } from "@/lib/logger";

export async function GET(request: NextRequest) {
  const admin = await getAdminSession();
  if (!admin) {
    return NextResponse.json({ error: "未授权" }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status");
    const page = parseInt(searchParams.get("page") || "1");
    const limit = 20;

    const where: any = {};
    if (status) {
      // "已完成"包含 DELIVERED 和 COMPLETED 两种状态
      if (status === "DELIVERED") {
        where.status = { in: ["DELIVERED", "COMPLETED"] };
      } else {
        where.status = status;
      }
    }

    const [orders, total] = await Promise.all([
      prisma.order.findMany({
        where,
        include: {
          items: {
            include: {
              product: {
                select: { id: true, name: true },
              },
            },
          },
          user: {
            select: { id: true, email: true, name: true },
          },
        },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.order.count({ where }),
    ]);

    return NextResponse.json({ orders: orders.map(withoutOrderPassword), total }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    logError("Get orders", error);
    return NextResponse.json(
      { error: "获取订单列表失败" },
      { status: 500 }
    );
  }
}
