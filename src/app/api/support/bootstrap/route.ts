import { NextResponse } from "next/server";
import { getPublicContactSettings } from "@/lib/contact-settings";
import { getSettings } from "@/lib/services/settings.service";
import { getSupportConfig, supportModelConfigured } from "@/lib/support/config";

export const dynamic = "force-dynamic";

export async function GET() {
  const [settings, config] = await Promise.all([getSettings(), getSupportConfig()]);
  return NextResponse.json({
    enabled: true,
    modelConfigured: supportModelConfigured(config),
    siteName: settings.siteName || "AI Shop",
    contact: getPublicContactSettings(settings),
    quickQuestions: ["怎么买商品？", "支持哪些支付方式？", "哪些商品有库存？", "支付成功后怎么查看卡密？", "怎么查询我的订单？", "如何联系客服？"],
  }, { headers: { "Cache-Control": "no-store" } });
}

