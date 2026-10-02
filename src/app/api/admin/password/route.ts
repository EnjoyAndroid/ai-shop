import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import prisma from "@/lib/db";
import bcrypt from "bcryptjs";
import { logError } from "@/lib/logger";

import { getAdminSession } from "@/lib/admin-auth";
import { rateLimit } from "@/lib/rate-limit";

export async function POST(request: NextRequest) {
  try {
    const session = await getAdminSession();
    if (!session) return NextResponse.json({ error: "未登录" }, { status: 401 });
    const adminId = session.id;
    if (!await rateLimit("admin-password", adminId, 5, 900)) return NextResponse.json({ error: "请求过于频繁" }, { status: 429 });

    const body = await request.json();
    const { currentPassword, newPassword } = body;

    if (typeof currentPassword !== "string" || typeof newPassword !== "string" || !currentPassword || !newPassword) {
      return NextResponse.json(
        { error: "请填写当前密码和新密码" },
        { status: 400 }
      );
    }

    if (newPassword.length < 12 || newPassword.length > 72) {
      return NextResponse.json(
        { error: "新密码需要12至72位" },
        { status: 400 }
      );
    }

    // 获取管理员信息
    const admin = await prisma.admin.findUnique({
      where: { id: adminId },
    });

    if (!admin) {
      return NextResponse.json({ error: "管理员不存在" }, { status: 404 });
    }

    // 验证当前密码
    const isValid = await bcrypt.compare(currentPassword, admin.password);
    if (!isValid) {
      return NextResponse.json({ error: "当前密码错误" }, { status: 400 });
    }

    // 更新密码
    const hashedPassword = await bcrypt.hash(newPassword, 12);
    await prisma.admin.update({
      where: { id: adminId },
      data: { password: hashedPassword, sessionVersion: { increment: 1 } },
    });

    (await cookies()).delete("admin_token");
    return NextResponse.json({ success: true });
  } catch (error) {
    logError("Change password", error);
    return NextResponse.json(
      { error: "修改密码失败" },
      { status: 500 }
    );
  }
}
