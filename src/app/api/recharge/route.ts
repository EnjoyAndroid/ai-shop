import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getPaymentProvider } from "@/lib/payment";
import { requirePaymentEnabled } from "@/lib/payment/config";
import { getClientIp } from "@/lib/get-client-ip";
import { rateLimit } from "@/lib/rate-limit";
import type { PaymentMethod } from "@prisma/client";
import { generateOrderNo, generatePassword } from "@/lib/encryption";
import prisma from "@/lib/db";
import { logError } from "@/lib/logger";

/**
 * 创建充值订单
 */
export async function POST(request: NextRequest) {
  try {
    const session = await auth();

    if (!session?.user?.id) {
      return NextResponse.json(
        { error: "请先登录" },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { amount, paymentMethod } = body;

    // 验证金额
    if (!Number.isSafeInteger(amount) || amount < 100) {
      return NextResponse.json(
        { error: "充值金额不能小于 1 元" },
        { status: 400 }
      );
    }

    if (amount > 10000000) {
      return NextResponse.json(
        { error: "单笔充值金额不能超过 10 万元" },
        { status: 400 }
      );
    }

    // 验证支付方式
    if (!["ALIPAY", "WECHAT", "USDT_TRC20"].includes(paymentMethod)) {
      return NextResponse.json(
        { error: "请选择有效的支付方式" },
        { status: 400 }
      );
    }

    await requirePaymentEnabled(paymentMethod as PaymentMethod);
    if (!await rateLimit("recharge", session.user.id, 10, 3600)) return NextResponse.json({ error: "请求过于频繁" }, { status: 429 });

    // 生成订单号
    const orderNo = "R" + generateOrderNo(); // R 开头表示充值订单
    const queryPassword = generatePassword();

    // 获取请求信息
    const ip = getClientIp(request);
    const userAgent = request.headers.get("user-agent") || "";

    // 设置订单过期时间 (10分钟)
    const expiredAt = new Date(Date.now() + 10 * 60 * 1000);

    // 创建充值订单
    const order = await prisma.order.create({
      data: {
        orderNo,
        userId: session.user.id,
        email: session.user.email || undefined,
        queryPassword,
        totalAmount: amount,
        discountAmount: 0,
        payAmount: amount,
        paymentMethod: paymentMethod as any,
        status: "PENDING",
        ip,
        userAgent,
        expiredAt,
        remark: "余额充值",
      },
    });

    // 创建支付链接
    const paymentProvider = getPaymentProvider(paymentMethod);
    const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";

    const paymentResult = await paymentProvider.createPayment({
      orderNo: order.orderNo,
      amount: order.payAmount,
      subject: `AI Shop 余额充值 ${(amount / 100).toFixed(2)} 元`,
      notifyUrl: `${baseUrl}/api/payment/callback/${paymentMethod.toLowerCase()}`,
      returnUrl: `${baseUrl}/balance?recharge=success`,
    });

    // 记录支付日志
    await prisma.paymentLog.create({
      data: {
        orderId: order.id,
        method: paymentMethod as any,
        action: "create",
        request: JSON.stringify({ orderNo: order.orderNo, amount: order.payAmount, type: "recharge" }),
        response: JSON.stringify(paymentResult),
        success: paymentResult.success,
        errorMsg: paymentResult.errorMsg,
      },
    });

    if (!paymentResult.success) {
      return NextResponse.json(
        { error: paymentResult.errorMsg || "创建支付失败" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      orderNo: order.orderNo,
      queryPassword: order.queryPassword,
      payUrl: paymentResult.payUrl,
      qrCode: paymentResult.qrCode,
      usdtAmount: (paymentResult as any).usdtAmount,
      exchangeRate: (paymentResult as any).exchangeRate,
    });
  } catch (error) {
    logError("Create recharge order", error);
    return NextResponse.json(
      { error: "创建充值订单失败，请检查支付配置" },
      { status: 500 }
    );
  }
}
