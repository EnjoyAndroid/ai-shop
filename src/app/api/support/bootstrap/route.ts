import { NextResponse } from "next/server";
import { getPublicContactSettings } from "@/lib/contact-settings";
import { getSettings } from "@/lib/services/settings.service";
import { getSupportConfig, supportModelConfigured } from "@/lib/support/config";

import { SUPPORT_NAME, SUPPORT_GREETING } from "@/lib/support/policy";
import { SUPPORT_QUICK_QUESTIONS } from "@/lib/support/faq";

export const dynamic = "force-dynamic";

export async function GET() {
  const [settings, config] = await Promise.all([getSettings(), getSupportConfig()]);
  return NextResponse.json({
    enabled: true,
    name: SUPPORT_NAME,
    greeting: SUPPORT_GREETING,
    modelConfigured: supportModelConfigured(config),
    siteName: settings.siteName || "AI Shop",
    contact: getPublicContactSettings(settings),
    quickQuestions: SUPPORT_QUICK_QUESTIONS,
  }, { headers: { "Cache-Control": "no-store" } });
}

