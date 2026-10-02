import { NextRequest, NextResponse } from "next/server";
import { getClientIp } from "@/lib/get-client-ip";
import { rateLimit } from "@/lib/rate-limit";
import { redis, CACHE_KEYS } from "@/lib/redis";

// 获取账号是否需要验证码
export async function POST(request: NextRequest) {
  try {
    const { account } = await request.json();

    if (!await rateLimit("login-status", getClientIp(request), 30, 60)) return NextResponse.json({ requireCaptcha: true }, { status: 429 });
    if (typeof account !== "string" || account.length > 254) {
      return NextResponse.json({ requireCaptcha: false });
    }

    const key = CACHE_KEYS.LOGIN_FAIL_COUNT(account.trim().toLowerCase());
    const failCount = await redis.get(key);

    // 失败 3 次及以上需要验证码
    return NextResponse.json({
      requireCaptcha: failCount ? parseInt(failCount) >= 3 : false,
    });
  } catch {
    return NextResponse.json({ requireCaptcha: true }, { status: 503 });
  }
}
