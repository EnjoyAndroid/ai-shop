import { NextRequest, NextResponse } from "next/server";
import { redis, CACHE_KEYS } from "@/lib/redis";

// 获取账号是否需要验证码
export async function POST(request: NextRequest) {
  try {
    const { account } = await request.json();

    if (!account) {
      return NextResponse.json({ requireCaptcha: false });
    }

    const key = CACHE_KEYS.LOGIN_FAIL_COUNT(account);
    const failCount = await redis.get(key);

    // 失败 3 次及以上需要验证码
    return NextResponse.json({
      requireCaptcha: failCount ? parseInt(failCount) >= 3 : false,
    });
  } catch {
    return NextResponse.json({ requireCaptcha: false });
  }
}
