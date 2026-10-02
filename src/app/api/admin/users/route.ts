import { NextResponse } from "next/server";
import prisma from "@/lib/db";
import { getAdminSession, hasAdminPermission } from "@/lib/admin-auth";
import { logError } from "@/lib/logger";

// 防止构建时预渲染
export const dynamic = "force-dynamic";

// 获取所有用户
export async function GET() {
  const admin = await getAdminSession();
  if (!admin) {
    return NextResponse.json({ error: "未授权" }, { status: 401 });
  }

  if (!hasAdminPermission(admin, "users")) return NextResponse.json({ error: "无权限" }, { status: 403 });
  try {
    const users = await prisma.user.findMany({
      orderBy: { createdAt: "desc" },
      select: {
        id: true, email: true, name: true, status: true, balance: true, totalSpent: true, createdAt: true,
        level: true,
        _count: {
          select: { orders: true },
        },
      },
    });

    return NextResponse.json({ users });
  } catch (error) {
    logError("Get users", error);
    return NextResponse.json(
      { error: "获取用户失败" },
      { status: 500 }
    );
  }
}
