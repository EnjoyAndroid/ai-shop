import { NextResponse } from "next/server";
import prisma from "@/lib/db";

// 防止构建时预渲染
export const dynamic = "force-dynamic";

// 获取所有用户
export async function GET() {
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
