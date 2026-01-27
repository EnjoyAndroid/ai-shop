import { NextRequest, NextResponse } from "next/server";
import { createOrder } from "@/lib/services/order.service";
import { AntiFraudService } from "@/lib/services/anti-fraud.service";
import { getPaymentProvider } from "@/lib/payment";
import { createOrderSchema } from "@/lib/validations";
import prisma from "@/lib/db";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // 验证请求数据
    const validationResult = createOrderSchema.safeParse(body);
    if (!validationResult.success) {
      return NextResponse.json(
        { error: validationResult.error.errors[0].message },
        { status: 400 }
      );
    }

    const { items, email, phone, paymentMethod } = validationResult.data;

    // 获取请求信息
    const ip = request.headers.get("x-forwarded-for") || request.headers.get("x-real-ip") || "";
    const userAgent = request.headers.get("user-agent") || "";
    const fingerprint = request.headers.get("x-fingerprint") || "";

    // 防刷检查
    const antiFraudResult = await AntiFraudService.checkOrderLimit({
      ip,
      email,
      fingerprint,
    });

    if (!antiFraudResult.allowed) {
      return NextResponse.json(
        { error: antiFraudResult.reason },
        { status: 429 }
      );
    }

    // 创建订单
    const order = await createOrder({
      email,
      phone,
      paymentMethod: paymentMethod as any,
      items,
      ip,
      userAgent,
      fingerprint,
    });

    // 余额支付直接处理
    if (paymentMethod === "BALANCE") {
      // TODO: 验证用户余额并扣除
      return NextResponse.json({
        orderNo: order.orderNo,
        queryPassword: order.queryPassword,
        message: "余额支付需要登录",
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
      returnUrl: `${baseUrl}/order/${order.orderNo}?password=${order.queryPassword}`,
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
    });
  } catch (error) {
    console.error("Create order error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "创建订单失败" },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const orderNo = searchParams.get("orderNo");
    const password = searchParams.get("password");

    if (!orderNo) {
      return NextResponse.json({ error: "请提供订单号" }, { status: 400 });
    }

    const order = await prisma.order.findUnique({
      where: { orderNo },
      include: {
        items: {
          include: {
            cardKeys: true,
            product: {
              select: { id: true, name: true, slug: true },
            },
          },
        },
      },
    });

    if (!order) {
      return NextResponse.json({ error: "订单不存在" }, { status: 404 });
    }

    // 验证查询密码
    if (!order.userId && order.queryPassword !== password) {
      return NextResponse.json({ error: "查询密码错误" }, { status: 403 });
    }

    return NextResponse.json({ order });
  } catch (error) {
    console.error("Query order error:", error);
    return NextResponse.json({ error: "查询订单失败" }, { status: 500 });
  }
}
