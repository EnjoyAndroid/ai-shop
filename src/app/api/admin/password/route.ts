import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import prisma from "@/lib/db";
import bcrypt from "bcryptjs";
import { jwtVerify } from "jose";

const JWT_SECRET = new TextEncoder().encode(
  process.env.NEXTAUTH_SECRET || "admin-secret-key"
);

export async function POST(request: NextRequest) {
  try {
    // 验证管理员登录状态
    const cookieStore = cookies();
    const token = cookieStore.get("admin_token")?.value;

    if (!token) {
      return NextResponse.json({ error: "未登录" }, { status: 401 });
    }

    // 验证 JWT token
    let adminId: string;
    try {
      const { payload } = await jwtVerify(token, JWT_SECRET);
      adminId = payload.id as string;
    } catch {
      return NextResponse.json({ error: "登录已过期，请重新登录" }, { status: 401 });
    }

    const body = await request.json();
    const { currentPassword, newPassword } = body;

    if (!currentPassword || !newPassword) {
      return NextResponse.json(
        { error: "请填写当前密码和新密码" },
        { status: 400 }
      );
    }

    if (newPassword.length < 8) {
      return NextResponse.json(
        { error: "新密码至少8位" },
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
      data: { password: hashedPassword },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Change password error:", error);
    return NextResponse.json(
      { error: "修改密码失败" },
      { status: 500 }
    );
  }
}
