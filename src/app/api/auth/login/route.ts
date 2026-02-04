import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import prisma from "@/lib/db";
import { redis, CACHE_KEYS } from "@/lib/redis";
import { consumeCaptchaToken } from "@/lib/captcha";
import { logError } from "@/lib/logger";

// 登录失败次数阈值
const FAIL_THRESHOLD = 3;
// 失败记录过期时间（15分钟）
const FAIL_EXPIRE_SECONDS = 15 * 60;

export async function POST(request: NextRequest) {
  try {
    const { account, password, captchaToken } = await request.json();

    if (!account || !password) {
      return NextResponse.json(
        { error: "请输入账号和密码" },
        { status: 400 }
      );
    }

    const failKey = CACHE_KEYS.LOGIN_FAIL_COUNT(account);
    const failCount = parseInt((await redis.get(failKey)) || "0");

    // 检查是否需要验证码
    if (failCount >= FAIL_THRESHOLD) {
      if (!captchaToken) {
        return NextResponse.json(
          { error: "请完成滑块验证", requireCaptcha: true },
          { status: 400 }
        );
      }

      const isValidCaptcha = await consumeCaptchaToken(captchaToken);
      if (!isValidCaptcha) {
        return NextResponse.json(
          { error: "验证码无效或已过期，请重新验证", requireCaptcha: true },
          { status: 400 }
        );
      }
    }

    // 查找用户
    const user = await prisma.user.findFirst({
      where: {
        OR: [{ email: account }, { phone: account }],
        status: "ACTIVE",
      },
    });

    if (!user || !user.password) {
      // 增加失败次数
      await redis.incr(failKey);
      await redis.expire(failKey, FAIL_EXPIRE_SECONDS);

      const newFailCount = failCount + 1;
      return NextResponse.json(
        {
          error: "账号或密码错误",
          requireCaptcha: newFailCount >= FAIL_THRESHOLD,
        },
        { status: 400 }
      );
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);

    if (!isPasswordValid) {
      // 增加失败次数
      await redis.incr(failKey);
      await redis.expire(failKey, FAIL_EXPIRE_SECONDS);

      const newFailCount = failCount + 1;
      return NextResponse.json(
        {
          error: "账号或密码错误",
          requireCaptcha: newFailCount >= FAIL_THRESHOLD,
        },
        { status: 400 }
      );
    }

    // 登录成功，清除失败次数
    await redis.del(failKey);

    return NextResponse.json({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
      },
    });
  } catch (error) {
    logError("User login", error);
    return NextResponse.json(
      { error: "登录失败，请稍后重试" },
      { status: 500 }
    );
  }
}
