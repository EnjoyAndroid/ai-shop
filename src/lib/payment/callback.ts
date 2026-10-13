import { NextRequest, NextResponse } from "next/server";
import { XunhuPayProvider } from "./index";
import { requirePaymentEnabled } from "./config";
import { handlePaymentSuccess } from "@/lib/services/order.service";
import { logError } from "@/lib/logger";
import { getClientIp } from "@/lib/get-client-ip";
import { rateLimit } from "@/lib/rate-limit";
import { readBoundedText } from "@/lib/request-body";
import { OrderRequestError } from "@/lib/order-errors";

export async function handleXunhuCallback(request: NextRequest, channel: "alipay" | "wechat") {
  try {
    const method = channel === "alipay" ? "ALIPAY" : "WECHAT";
    await requirePaymentEnabled(method);
    if (!await rateLimit("payment-callback", getClientIp(request), 120, 60)) return new NextResponse("fail", { status: 429 });
    const raw = await readBoundedText(request, 16384);
    const form = new URLSearchParams(raw);
    const params: Record<string, string> = Object.create(null);
    for (const [key, value] of form) {
      if (Object.hasOwn(params, key)) return new NextResponse("fail", { status: 400 });
      params[key] = value;
    }
    const result = await new XunhuPayProvider(channel).verifyCallback(params);
    if (!result.success || !result.orderNo || !result.tradeNo || !result.amount) return new NextResponse("fail", { status: 400 });
    await handlePaymentSuccess(result.orderNo, result.tradeNo, { method, amount: result.amount });
    return new NextResponse("success");
  } catch (error) {
    if (error instanceof OrderRequestError && error.status === 413) return new NextResponse("fail", { status: 413 });
    logError("Payment callback", error);
    return new NextResponse("fail", { status: 400 });
  }
}
