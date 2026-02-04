import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { cookies } from "next/headers";
import prisma from "@/lib/db";
import redis from "@/lib/redis";
import { SignJWT } from "jose";
import { logError } from "@/lib/logger";

const JWT_SECRET = new TextEncoder().encode(
  process.env.NEXTAUTH_SECRET || "admin-secret-key"
);

// 登录失败限制配置
const FAIL_THRESHOLD = 5; // 5次失败后锁定
const FAIL_EXPIRE_SECONDS = 30 * 60; // 30分钟

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { username, password } = body;

    if (!username || !password) {
      return NextResponse.json(
        { error: "请输入用户名和密码" },
        { status: 400 }
      );
    }

    // 检查登录失败次数
    const failKey = `admin_login_fail:${username}`;
    const failCount = parseInt((await redis.get(failKey)) || "0");

    if (failCount >= FAIL_THRESHOLD) {
      const ttl = await redis.ttl(failKey);
      return NextResponse.json(
        { error: `登录失败次数过多，请${Math.ceil(ttl / 60)}分钟后再试` },
        { status: 429 }
      );
    }

    // 查找管理员
    const admin = await prisma.admin.findUnique({
      where: { username },
    });

    if (!admin) {
      // 增加失败计数
      await redis.incr(failKey);
      await redis.expire(failKey, FAIL_EXPIRE_SECONDS);
      return NextResponse.json(
        { error: "用户名或密码错误" },
        { status: 401 }
      );
    }

    if (admin.status !== "ACTIVE") {
      return NextResponse.json(
        { error: "账号已被禁用" },
        { status: 401 }
      );
    }

    // 验证密码
    const isValid = await bcrypt.compare(password, admin.password);

    if (!isValid) {
      // 增加失败计数
      await redis.incr(failKey);
      await redis.expire(failKey, FAIL_EXPIRE_SECONDS);
      const newCount = failCount + 1;
      const remaining = FAIL_THRESHOLD - newCount;
      return NextResponse.json(
        { error: `用户名或密码错误${remaining > 0 ? `，还剩${remaining}次机会` : ""}` },
        { status: 401 }
      );
    }

    // 登录成功，清除失败计数
    await redis.del(failKey);

    // 更新最后登录时间
    await prisma.admin.update({
      where: { id: admin.id },
      data: {
        lastLoginAt: new Date(),
        lastLoginIp: request.headers.get("x-forwarded-for") || "",
      },
    });

    // 生成 JWT token
    const token = await new SignJWT({
      id: admin.id,
      username: admin.username,
      role: admin.role,
    })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuedAt()
      .setExpirationTime("24h")
      .sign(JWT_SECRET);

    // 设置 cookie（使用 strict 模式增强 CSRF 保护）
    cookies().set("admin_token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      maxAge: 60 * 60 * 24, // 24 hours
      path: "/",
    });

    return NextResponse.json({
      success: true,
      admin: {
        id: admin.id,
        username: admin.username,
        name: admin.name,
        role: admin.role,
      },
    });
  } catch (error) {
    logError("Admin login", error);
    return NextResponse.json(
      { error: "登录失败，请稍后重试" },
      { status: 500 }
    );
  }
}
