import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { getAdminSession } from "@/lib/admin-auth";
import { logError } from "@/lib/logger";

// 更新用户状态（封禁/解封）
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const admin = await getAdminSession();
  if (!admin) {
    return NextResponse.json({ error: "未授权" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { status } = body;

    if (!["ACTIVE", "BANNED"].includes(status)) {
      return NextResponse.json(
        { error: "无效的状态" },
        { status: 400 }
      );
    }

    const user = await prisma.user.findUnique({
      where: { id: params.id },
    });

    if (!user) {
      return NextResponse.json(
        { error: "用户不存在" },
        { status: 404 }
      );
    }

    await prisma.user.update({
      where: { id: params.id },
      data: { status },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    logError("Update user status", error);
    return NextResponse.json(
      { error: "更新状态失败" },
      { status: 500 }
    );
  }
}
