import { NextRequest, NextResponse } from "next/server";
import { createOrder } from "@/lib/services/order.service";
import { AntiFraudService } from "@/lib/services/anti-fraud.service";
import { getPaymentProvider } from "@/lib/payment";
import { requirePaymentEnabled } from "@/lib/payment/config";
import { createOrderSchema } from "@/lib/validations";
import { decryptCardKey } from "@/lib/services/product.service";
import { auth } from "@/lib/auth";
import prisma from "@/lib/db";
import redis from "@/lib/redis";
import { logError } from "@/lib/logger";
import { getClientIp } from "@/lib/get-client-ip";

// 订单查询频率限制（防暴力破解查询密码）
const QUERY_RATE_LIMIT = 20; // 最多查询次数
const QUERY_RATE_WINDOW = 300; // 5 分钟

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

    const { items, email, paymentMethod } = validationResult.data;
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
      return NextResponse.json(
        { error: antiFraudResult.reason },
        { status: 429 }
      );
    }

    // 创建订单
    const order = await createOrder({
      userId,
      email,
      paymentMethod: paymentMethod as any,
      items,
      ip,
      userAgent,
      fingerprint,
    });

    // 余额支付直接处理
    if (paymentMethod === "BALANCE") {
      return NextResponse.json({
        orderNo: order.orderNo,
        queryPassword: order.queryPassword,
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
    logError("Create order", error);
    return NextResponse.json(
      { error: "创建订单失败，请检查库存、余额和支付方式" },
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

    // 获取客户端 IP 用于频率限制
    const clientIp = getClientIp(request);

    // 订单查询频率限制（防暴力破解）
    const rateLimitKey = `order_query:${clientIp}:${orderNo}`;
    const queryCount = await redis.incr(rateLimitKey);
    if (queryCount === 1) {
      await redis.expire(rateLimitKey, QUERY_RATE_WINDOW);
    }
    if (queryCount > QUERY_RATE_LIMIT) {
      return NextResponse.json(
        { error: "查询过于频繁，请稍后再试" },
        { status: 429 }
      );
    }

    const order = await prisma.order.findUnique({
      where: { orderNo },
      include: {
        items: {
          include: {
            // 限制单次查询的卡密数量，防止大量数据导致性能问题
            cardKeys: {
              take: 100,
              orderBy: { createdAt: "asc" },
            },
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

    // 验证查询密码（游客订单需要密码）
    if (!order.userId && order.queryPassword !== password) {
      return NextResponse.json({ error: "查询密码错误" }, { status: 403 });
    }

    // 仅对已支付订单解密卡密
    const orderWithDecryptedKeys = {
      id: order.id, orderNo: order.orderNo, email: order.email,
      totalAmount: order.totalAmount, discountAmount: order.discountAmount,
      payAmount: order.payAmount, paymentMethod: order.paymentMethod,
      status: order.status, createdAt: order.createdAt, paidAt: order.paidAt, expiredAt: order.expiredAt,
      items: order.items.map(item => ({
        id: item.id, productName: item.productName, price: item.price, quantity: item.quantity, product: item.product,
        cardKeys: ["PAID", "DELIVERED", "COMPLETED"].includes(order.status)
          ? item.cardKeys.map(ck => ({ id: ck.id, content: decryptCardKey(ck) })) : [],
      })),
    };

    return NextResponse.json({ order: orderWithDecryptedKeys }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    logError("Query order", error);
    return NextResponse.json({ error: "查询订单失败" }, { status: 500 });
  }
}
