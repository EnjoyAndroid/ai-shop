import { NextRequest, NextResponse } from "next/server";
import { createOrder, handlePaymentSuccess } from "@/lib/services/order.service";
import { AntiFraudService } from "@/lib/services/anti-fraud.service";
import { getPaymentProvider } from "@/lib/payment";
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

    const { items, email, phone, paymentMethod } = validationResult.data;

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
      phone,
      paymentMethod: paymentMethod as any,
      items,
      ip,
      userAgent,
      fingerprint,
    });

    // 余额支付直接处理
    if (paymentMethod === "BALANCE") {
      if (!userId) {
        return NextResponse.json(
          { error: "请先登录后使用余额支付" },
          { status: 401 }
        );
      }

      // 获取用户余额
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { balance: true },
      });

      if (!user || user.balance < order.payAmount) {
        return NextResponse.json(
          { error: `余额不足，当前余额 ¥${((user?.balance || 0) / 100).toFixed(2)}` },
          { status: 400 }
        );
      }

      // 扣除余额并更新订单状态
      await prisma.$transaction(async (tx) => {
        // 扣除用户余额
        await tx.user.update({
          where: { id: userId },
          data: {
            balance: { decrement: order.payAmount },
          },
        });

        // 创建余额变动记录
        await tx.balanceLog.create({
          data: {
            userId,
            type: "CONSUME",
            amount: -order.payAmount,
            balance: user.balance - order.payAmount,
            remark: `购买商品 - 订单${order.orderNo}`,
            orderId: order.id,
          },
        });
      });

      // 处理支付成功逻辑（更新订单状态、发送通知等）
      await handlePaymentSuccess(order.orderNo, `BALANCE_${order.orderNo}`);

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
      usdtAmount: (paymentResult as any).usdtAmount,
      exchangeRate: (paymentResult as any).exchangeRate,
    });
  } catch (error) {
    logError("Create order", error);
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
      ...order,
      items: order.items.map((item) => ({
        ...item,
        cardKeys: order.status === "PAID" || order.status === "DELIVERED" || order.status === "COMPLETED"
          ? item.cardKeys.map((ck) => ({
              ...ck,
              content: decryptCardKey(ck),
            }))
          : [], // 未支付订单不返回卡密
      })),
    };

    return NextResponse.json({ order: orderWithDecryptedKeys });
  } catch (error) {
    logError("Query order", error);
    return NextResponse.json({ error: "查询订单失败" }, { status: 500 });
  }
}
