import { NextRequest, NextResponse } from "next/server";
import { handlePaymentSuccess } from "@/lib/services/order.service";
import { XunhuPayProvider } from "@/lib/payment";
import prisma from "@/lib/db";
import { logError } from "@/lib/logger";

// 支付宝回调
export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const params: Record<string, string> = {};

    formData.forEach((value, key) => {
      params[key] = value.toString();
    });

    // 生产环境不打印完整回调参数，避免泄露签名等敏感信息
    if (process.env.NODE_ENV === "development") {
      console.log("Alipay callback params:", params);
    }

    // 验证签名
    const provider = new XunhuPayProvider("alipay");
    const result = await provider.verifyCallback(params);

    // 记录回调日志
    await prisma.paymentLog.create({
      data: {
        orderId: params.trade_order_id ?
          (await prisma.order.findUnique({ where: { orderNo: params.trade_order_id } }))?.id || "" : "",
        method: "ALIPAY",
        action: "callback",
        request: JSON.stringify(params),
        response: JSON.stringify(result),
        success: result.success,
        errorMsg: result.errorMsg,
      },
    });

    if (!result.success) {
      return new NextResponse("fail", { status: 200 });
    }

    // 处理支付成功
    await handlePaymentSuccess(result.orderNo!, result.tradeNo!);

    return new NextResponse("success", { status: 200 });
  } catch (error) {
    logError("Alipay callback", error);
    return new NextResponse("fail", { status: 200 });
  }
}
