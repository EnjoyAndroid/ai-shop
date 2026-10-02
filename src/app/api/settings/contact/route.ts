import { NextResponse } from "next/server";
import { getSetting } from "@/lib/services/settings.service";
import { getSafeTelegramUrl } from "@/lib/contact-settings";

export const dynamic = "force-dynamic";

// 只公开客服链接，禁止把后台完整设置返回给匿名访客。
export async function GET() {
  const telegramUrl = getSafeTelegramUrl(await getSetting("telegramUrl"));
  return NextResponse.json({ telegramUrl }, { headers: { "Cache-Control": "no-store" } });
}
