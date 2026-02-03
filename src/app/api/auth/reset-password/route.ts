import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import prisma from "@/lib/db";
import redis from "@/lib/redis";

export async function POST(request: NextRequest) {
  try {
    const { token, password } = await request.json();

    if (!token || !password) {
      return NextResponse.json({ error: "参数不完整" }, { status: 400 });
    }

    if (password.length < 8) {
      return NextResponse.json({ error: "密码长度不能少于8位" }, { status: 400 });
    }

    // 从 Redis 获取用户 ID
    const userId = await redis.get(`reset_password:${token}`);

    if (!userId) {
      return NextResponse.json({ error: "重置链接已过期或无效" }, { status: 400 });
    }

    // 查找用户
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      return NextResponse.json({ error: "用户不存在" }, { status: 404 });
    }

    // 加密新密码
    const hashedPassword = await bcrypt.hash(password, 12);

    // 更新密码
    await prisma.user.update({
      where: { id: userId },
      data: { password: hashedPassword },
    });

    // 删除重置 token
    await redis.del(`reset_password:${token}`);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Reset password error:", error);
    return NextResponse.json({ error: "重置失败，请稍后重试" }, { status: 500 });
  }
}
