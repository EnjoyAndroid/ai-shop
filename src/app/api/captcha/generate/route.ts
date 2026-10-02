import { NextRequest, NextResponse } from "next/server";
import { createCaptcha } from "@/lib/captcha";
import { getClientIp } from "@/lib/get-client-ip";
import { rateLimit } from "@/lib/rate-limit";
import { logError } from "@/lib/logger";
export async function POST(request: NextRequest) {
  try {
    const ip = getClientIp(request);
    if (!await rateLimit("captcha-create", ip, 10, 60)) return NextResponse.json({ error: "请求过于频繁" }, { status: 429 });
    return NextResponse.json({ success: true, ...await createCaptcha(ip) });
  } catch (error) {
    logError("Create captcha", error);
    return NextResponse.json({ error: "验证服务暂不可用" }, { status: 503 });
  }
}
