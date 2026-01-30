import { NextRequest, NextResponse } from "next/server";
import { getPaymentProvider } from "@/lib/payment";
import prisma from "@/lib/db";

// 重新获取/生成支付信息
export async function GET(
  request: NextRequest,
  { params }: { params: { orderNo: string } }
) {
  try {
    const { searchParams } = new URL(request.url);
    const password = searchParams.get("password");
    const orderNo = params.orderNo;

    const order = await prisma.order.findUnique({
      where: { orderNo },
    });

    if (!order) {
      return NextResponse.json({ error: "订单不存在" }, { status: 404 });
    }

    // 验证查询密码
    if (!order.userId && order.queryPassword !== password) {
      return NextResponse.json({ error: "查询密码错误" }, { status: 403 });
    }

    // 检查订单状态
    if (order.status !== "PENDING") {
      return NextResponse.json({ error: "订单状态不允许支付" }, { status: 400 });
    }

    // 检查是否过期
    if (order.expiredAt && new Date(order.expiredAt) < new Date()) {
      return NextResponse.json({ error: "订单已过期" }, { status: 400 });
    }

    // 重新生成支付链接
    const paymentProvider = getPaymentProvider(order.paymentMethod);
    const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";

    const paymentResult = await paymentProvider.createPayment({
      orderNo: order.orderNo,
      amount: order.payAmount,
      subject: `AI Shop 订单 ${order.orderNo}`,
      notifyUrl: `${baseUrl}/api/payment/callback/${order.paymentMethod.toLowerCase()}`,
      returnUrl: `${baseUrl}/order/${order.orderNo}?password=${order.queryPassword}`,
    });

    if (!paymentResult.success) {
      return NextResponse.json(
        { error: paymentResult.errorMsg || "获取支付信息失败" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      orderNo: order.orderNo,
      payAmount: order.payAmount,
      paymentMethod: order.paymentMethod,
      qrCode: paymentResult.qrCode,
      payUrl: paymentResult.payUrl,
      usdtAmount: (paymentResult as any).usdtAmount,
      exchangeRate: (paymentResult as any).exchangeRate,
      expiredAt: order.expiredAt,
    });
  } catch (error) {
    console.error("Get payment info error:", error);
    return NextResponse.json(
      { error: "获取支付信息失败" },
      { status: 500 }
    );
  }
}
