import { NextResponse } from "next/server";
import { isPaymentEnabled } from "@/lib/payment/config";
import { logError } from "@/lib/logger";
export const dynamic = "force-dynamic";
export async function GET() {
  try {
    const available = [
      { value: "WECHAT" as const, label: "微信", icon: "💚" },
      { value: "ALIPAY" as const, label: "支付宝", icon: "💳" },
      { value: "USDT_TRC20" as const, label: "USDT(TRON-TRC20)", icon: "₮" },
      { value: "BALANCE" as const, label: "余额", icon: "💵" },
    ];
    const enabled = await Promise.all(available.map(method => isPaymentEnabled(method.value)));
    return NextResponse.json({ methods: available.filter((_, index) => enabled[index]) });
  } catch (error) {
    logError("Payment methods", error);
    return NextResponse.json({ methods: [], error: "支付服务暂不可用" }, { status: 503 });
  }
}
