import { NextResponse } from "next/server";
import { getSupportIdentity, createSupportConversation, getLatestSupportConversation } from "@/lib/support/service";
import { getClientIp } from "@/lib/get-client-ip";
import { rateLimit } from "@/lib/rate-limit";
import { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    if (!await rateLimit("support-conversation", getClientIp(request), 10, 60)) return NextResponse.json({ error: "客服请求过于频繁，请稍后再试" }, { status: 429 });
    const identity = await getSupportIdentity();
    const conversation = await createSupportConversation(identity);
    return NextResponse.json({ conversation });
  } catch {
    return NextResponse.json({ error: "无法创建客服会话，请稍后重试" }, { status: 503 });
  }
}

export async function GET() {
  try {
    const identity = await getSupportIdentity();
    const conversation = await getLatestSupportConversation(identity);
    return NextResponse.json({ conversation }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "无法恢复客服会话，请稍后重试" }, { status: 503 });
  }
}

