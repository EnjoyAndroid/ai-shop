import { NextRequest, NextResponse } from "next/server";
import { getSupportConversation, getSupportIdentity } from "@/lib/support/service";

export const dynamic = "force-dynamic";

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const identity = await getSupportIdentity();
  const conversation = await getSupportConversation((await params).id, identity);
  if (!conversation) return NextResponse.json({ error: "客服会话不存在或已过期" }, { status: 404 });
  return NextResponse.json({ conversation }, { headers: { "Cache-Control": "no-store" } });
}

