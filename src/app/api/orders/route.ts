import { NextRequest } from "next/server";
import { issueOrderAccess } from "@/lib/order-access";
import { orderJson, orderError } from "@/lib/order-http";
import { createOrder } from "@/lib/services/order.service";
import { AntiFraudService } from "@/lib/services/anti-fraud.service";
import { getPaymentProvider } from "@/lib/payment";
import { requirePaymentEnabled } from "@/lib/payment/config";
import { createOrderSchema } from "@/lib/validations";
import { auth } from "@/lib/auth";
import prisma from "@/lib/db";
import { getClientIp } from "@/lib/get-client-ip";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // 验证请求数据
    const validationResult = createOrderSchema.safeParse(body);
    if (!validationResult.success) {
      return orderJson(
        { error: validationResult.error.errors[0].message },
        400
      );
    }

    const { productId, quantity, queryPassword, email, paymentMethod } = validationResult.data;
    await requirePaymentEnabled(paymentMethod);

    // 获取当前登录用户
    const session = await auth();
    const userId = session?.user?.id;

    // 获取请求信息
    const ip = getClientIp(request);
    const userAgent = request.headers.get("user-agent") || "";
    const fingerprint = request.headers.get("x-fingerprint") || "";

    // 防刷检查
    const antiFraudResult = await AntiFraudService.checkOrderLimit({
      ip,
      email,
      fingerprint,
    });

    if (!antiFraudResult.allowed) {
      return orderJson(
        { error: antiFraudResult.reason },
        429
      );
    }

    // 创建订单
    const order = await createOrder({
      userId,
      email,
      paymentMethod: paymentMethod as any,
      productId, quantity, queryPassword,
      ip,
      userAgent,
      fingerprint,
    });

    const accessToken = await issueOrderAccess(order.id);

    // 余额支付直接处理
    if (paymentMethod === "BALANCE") {
      return orderJson({
        orderNo: order.orderNo,
        accessToken,
        message: "支付成功",
      });
    }

    // 创建支付链接
    const paymentProvider = getPaymentProvider(paymentMethod);
    const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";

    const paymentResult = await paymentProvider.createPayment({
      orderNo: order.orderNo,
      amount: order.payAmount,
      subject: `AI Shop 订单 ${order.orderNo}`,
      notifyUrl: `${baseUrl}/api/payment/callback/${paymentMethod.toLowerCase()}`,
      returnUrl: `${baseUrl}/order/${order.orderNo}`,
    });

    // 记录支付日志
    await prisma.paymentLog.create({
      data: {
        orderId: order.id,
        method: paymentMethod as any,
        action: "create",
        request: JSON.stringify({ orderNo: order.orderNo, amount: order.payAmount }),
        response: JSON.stringify(paymentResult),
        success: paymentResult.success,
        errorMsg: paymentResult.errorMsg,
      },
    });

    if (!paymentResult.success) {
      return orderJson(
        { error: paymentResult.errorMsg || "创建支付失败" },
        500
      );
    }

    return orderJson({
      orderNo: order.orderNo,
      accessToken,
      payUrl: paymentResult.payUrl,
      qrCode: paymentResult.qrCode,
      usdtAmount: (paymentResult as any).usdtAmount,
      exchangeRate: (paymentResult as any).exchangeRate,
    });
  } catch (error) {
    return orderError("Create order", error);
  }
}
