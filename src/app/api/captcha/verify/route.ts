import { NextRequest, NextResponse } from "next/server";
import { verifyCaptcha } from "@/lib/captcha";
import { getClientIp } from "@/lib/get-client-ip";
import { rateLimit } from "@/lib/rate-limit";
import { logError } from "@/lib/logger";
export async function POST(request: NextRequest) {
  try {
    const ip = getClientIp(request);
    if (!await rateLimit("captcha-verify", ip, 20, 60)) return NextResponse.json({ error: "请求过于频繁" }, { status: 429 });
    const { token, position } = await request.json();
    if (typeof token !== "string" || typeof position !== "number" || !await verifyCaptcha(token, position, ip)) {
      return NextResponse.json({ error: "验证失败，请重试" }, { status: 400 });
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    logError("Verify captcha", error);
    return NextResponse.json({ error: "验证服务暂不可用" }, { status: 503 });
  }
}
