import { NextResponse } from "next/server";
import { getSettings } from "@/lib/services/settings.service";
import { getCommunitySettings } from "@/lib/community-settings";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(getCommunitySettings(await getSettings()), {
    headers: { "Cache-Control": "no-store" },
  });
}
