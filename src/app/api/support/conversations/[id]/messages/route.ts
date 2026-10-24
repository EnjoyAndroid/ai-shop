import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSupportIdentity, answerSupportTurn, renewSupportCookie, SupportRequestError } from "@/lib/support/service";
import { readBoundedJson } from "@/lib/request-body";
import { getClientIp } from "@/lib/get-client-ip";
import { rateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

const messageSchema = z.object({
  requestId: z.string().regex(/^[A-Za-z0-9_-]{8,80}$/, "请求编号无效"),
  message: z.string().trim().min(1, "请输入问题").max(2000, "问题不能超过 2000 个字符"),
}).strict();

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    if (!await rateLimit("support-message", getClientIp(request), 30, 60)) return NextResponse.json({ error: "消息发送过于频繁，请稍后再试" }, { status: 429 });
    const body = messageSchema.parse(await readBoundedJson(request, 16 * 1024));
    const identity = await getSupportIdentity();
    const result = await answerSupportTurn((await params).id, body.requestId, body.message, identity);
    await renewSupportCookie(identity);
    return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message = error instanceof z.ZodError ? error.issues[0]?.message : error instanceof Error ? error.message : "客服服务暂不可用";
    const status = error instanceof SupportRequestError ? error.status : error instanceof z.ZodError ? 400 : message.includes("不存在") || message.includes("过期") ? 404 : 503;
    return NextResponse.json({ error: message }, { status, headers: { "Cache-Control": "no-store" } });
  }
}

