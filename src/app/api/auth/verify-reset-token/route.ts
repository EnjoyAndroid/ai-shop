import { NextRequest, NextResponse } from "next/server";
import redis from "@/lib/redis";
import { logError } from "@/lib/logger";
import { isResetGrantCurrent, parseResetGrant, resetTokenKey, resetTokenSchema } from "@/lib/password-reset";
import { getClientIp } from "@/lib/get-client-ip";
import { rateLimit } from "@/lib/rate-limit";

export async function POST(request: NextRequest) {
  try {
    if (!await rateLimit("verify-reset", getClientIp(request), 30, 60)) return NextResponse.json({ valid: false, error: "请求过于频繁" }, { status: 429 });
    const { token } = await request.json();

    if (!resetTokenSchema.safeParse(token).success) {
      return NextResponse.json({ valid: false, error: "参数不完整" }, { status: 400 });
    }

    const grant = parseResetGrant(await redis.get(resetTokenKey(token)));

    if (!grant || !await isResetGrantCurrent(grant)) {
      return NextResponse.json({ valid: false, error: "重置链接已过期或无效" });
    }

    return NextResponse.json({ valid: true });
  } catch (error) {
    logError("Verify reset token", error);
    return NextResponse.json({ valid: false, error: "验证失败" }, { status: 500 });
  }
}
