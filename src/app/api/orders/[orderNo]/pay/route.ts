import { NextRequest } from "next/server";
import { accessibleOrder, orderError, orderJson } from "@/lib/order-http";

export const dynamic = "force-dynamic";
import { getPaymentProvider } from "@/lib/payment";
import { requirePaymentEnabled } from "@/lib/payment/config";

// 重新获取/生成支付信息
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ orderNo: string }> }
) {
  try {
    const order = await accessibleOrder(request, (await params).orderNo, "payment-info");
    // 检查订单状态
    if (order.status !== "PENDING") {
      return orderJson({ error: "订单状态不允许支付" }, 400);
    }

    // 检查是否过期
    if (order.expiredAt && new Date(order.expiredAt) < new Date()) {
      return orderJson({ error: "订单已过期" }, 400);
    }

    // 检查支付方式
    if (!order.paymentMethod) {
      return orderJson({ error: "订单支付方式无效" }, 400);
    }

    await requirePaymentEnabled(order.paymentMethod);

    // 重新生成支付链接
    const paymentProvider = getPaymentProvider(order.paymentMethod);
    const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";

    const paymentResult = await paymentProvider.createPayment({
      orderNo: order.orderNo,
      amount: order.payAmount,
      subject: `AI Shop 订单 ${order.orderNo}`,
      notifyUrl: `${baseUrl}/api/payment/callback/${order.paymentMethod.toLowerCase()}`,
      returnUrl: `${baseUrl}/order/${order.orderNo}`,
    });

    if (!paymentResult.success) {
      return orderJson(
        { error: paymentResult.errorMsg || "获取支付信息失败" },
        500
      );
    }

    return orderJson({
      orderNo: order.orderNo,
      payAmount: order.payAmount,
      paymentMethod: order.paymentMethod,
      qrCode: paymentResult.qrCode,
      payUrl: paymentResult.payUrl,
      usdtAmount: (paymentResult as any).usdtAmount,
      exchangeRate: (paymentResult as any).exchangeRate,
      expiredAt: order.expiredAt,
    });
  } catch (error) { return orderError("Get payment info", error); }
}
