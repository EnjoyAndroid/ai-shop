import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import prisma from "@/lib/db";
import { registerSchema } from "@/lib/validations";
import { consumeCaptchaToken } from "@/lib/captcha";
import { getClientIp } from "@/lib/get-client-ip";
import { rateLimit } from "@/lib/rate-limit";
import { logError } from "@/lib/logger";

export async function POST(request: NextRequest) {
  try {
    const ip = getClientIp(request);
    if (!await rateLimit("register", ip, 5, 3600)) return NextResponse.json({ error: "注册过于频繁" }, { status: 429 });
    const body = await request.json();

    // 验证滑块验证码（必须已通过滑块验证）
    const { captchaToken } = body;
    if (!captchaToken) {
      return NextResponse.json(
        { error: "请完成滑块验证" },
        { status: 400 }
      );
    }

    const isValidCaptcha = await consumeCaptchaToken(typeof captchaToken === "string" ? captchaToken : "", ip);
    if (!isValidCaptcha) {
      return NextResponse.json(
        { error: "验证码无效或已过期，请重新验证" },
        { status: 400 }
      );
    }

    // 验证请求数据
    const validationResult = registerSchema.safeParse(body);
    if (!validationResult.success) {
      return NextResponse.json(
        { error: validationResult.error.errors[0].message },
        { status: 400 }
      );
    }

    const { email, password } = validationResult.data;

    // 检查邮箱是否已存在
    if (email) {
      const existingEmail = await prisma.user.findUnique({
        where: { email },
      });
      if (existingEmail) {
        return NextResponse.json(
          { error: "该邮箱已被注册" },
          { status: 400 }
        );
      }
    }

    // 获取默认会员等级
    const defaultLevel = await prisma.userLevel.findFirst({
      where: { minSpent: 0 },
      orderBy: { minSpent: "asc" },
    });

    // 加密密码
    const hashedPassword = await bcrypt.hash(password, 12);

    // 创建用户
    const user = await prisma.user.create({
      data: {
        email,
        password: hashedPassword,
        levelId: defaultLevel?.id,
      },
    });

    return NextResponse.json({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
      },
    });
  } catch (error) {
    logError("User register", error);
    return NextResponse.json(
      { error: "注册失败，请稍后重试" },
      { status: 500 }
    );
  }
}
