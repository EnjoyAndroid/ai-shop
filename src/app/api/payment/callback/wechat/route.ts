import { NextRequest, NextResponse } from "next/server";
import { handlePaymentSuccess } from "@/lib/services/order.service";
import { XunhuPayProvider } from "@/lib/payment";
import prisma from "@/lib/db";

// 微信支付回调
export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const params: Record<string, string> = {};

    formData.forEach((value, key) => {
      params[key] = value.toString();
    });

    console.log("Wechat callback params:", params);

    // 验证签名
    const provider = new XunhuPayProvider("wechat");
    const result = await provider.verifyCallback(params);

    // 记录回调日志
    await prisma.paymentLog.create({
      data: {
        orderId: params.trade_order_id ?
          (await prisma.order.findUnique({ where: { orderNo: params.trade_order_id } }))?.id || "" : "",
        method: "WECHAT",
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
    console.error("Wechat callback error:", error);
    return new NextResponse("fail", { status: 200 });
  }
}
