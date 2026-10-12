import { NextResponse } from "next/server";
import QRCode from "qrcode";
import { getCommunityEntryUrl } from "@/lib/community-settings";
import { logError } from "@/lib/logger";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const entryUrl = getCommunityEntryUrl(process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000");
    const image = await QRCode.toBuffer(entryUrl, { width: 320, margin: 4, errorCorrectionLevel: "M" });
    return new NextResponse(new Uint8Array(image), {
      headers: { "Content-Type": "image/png", "Cache-Control": "no-store" },
    });
  } catch (error) {
    logError("Community entry QR", error);
    return NextResponse.json({ error: "暂时无法生成入口二维码" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
