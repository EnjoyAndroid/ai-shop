import { NextResponse } from "next/server";
import prisma from "@/lib/db";
import { getAdminSession } from "@/lib/admin-auth";

// 防止构建时预渲染
export const dynamic = "force-dynamic";

// 获取所有用户
export async function GET() {
  const admin = await getAdminSession();
  if (!admin) {
    return NextResponse.json({ error: "未授权" }, { status: 401 });
  }

  try {
    const users = await prisma.user.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        level: true,
        _count: {
          select: { orders: true },
        },
      },
    });

    return NextResponse.json({ users });
  } catch (error) {
    console.error("Get users error:", error);
    return NextResponse.json(
      { error: "获取用户失败" },
      { status: 500 }
    );
  }
}
