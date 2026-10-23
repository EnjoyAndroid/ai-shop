import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSupportIdentity, setSupportFeedback } from "@/lib/support/service";
import { readBoundedJson } from "@/lib/request-body";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { value } = z.object({ value: z.union([z.literal(-1), z.literal(1)]) }).parse(await readBoundedJson(request, 1024));
    const ok = await setSupportFeedback((await params).id, value, await getSupportIdentity());
    return NextResponse.json({ success: ok }, { status: ok ? 200 : 404 });
  } catch { return NextResponse.json({ error: "反馈无效" }, { status: 400 }); }
}

