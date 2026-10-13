import { NextResponse } from "next/server";
import { getSettings } from "@/lib/services/settings.service";
import { getPublicContactSettings } from "@/lib/contact-settings";

export const dynamic = "force-dynamic";

// 仅公开客服展示字段，禁止把后台完整设置返回给匿名访客。
export async function GET() {
  return NextResponse.json(getPublicContactSettings(await getSettings()), { headers: { "Cache-Control": "no-store" } });
}
