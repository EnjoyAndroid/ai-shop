import { NextRequest, NextResponse } from "next/server";
import { handlePaymentSuccess } from "@/lib/services/order.service";
import { USDTProvider } from "@/lib/payment";
import { requirePaymentEnabled } from "@/lib/payment/config";
import { rateLimit } from "@/lib/rate-limit";
import { getClientIp } from "@/lib/get-client-ip";
import prisma from "@/lib/db";
import { logError } from "@/lib/logger";

/**
 * USDT 支付状态查询 API
 * 前端轮询调用，自动检测区块链上的付款
 */
export async function GET(request: NextRequest) {
  try {
    if (!await rateLimit("usdt-check", getClientIp(request), 30, 60)) return NextResponse.json({ error: "请求过于频繁" }, { status: 429 });
    const { searchParams } = new URL(request.url);
    const orderNo = searchParams.get("orderNo");
    const password = searchParams.get("password");

    if (!orderNo) {
      return NextResponse.json(
        { success: false, error: "缺少订单号" },
        { status: 400 }
      );
    }

    // 查询订单
    const order = await prisma.order.findUnique({
      where: { orderNo },
    });

    if (!order) {
      return NextResponse.json(
        { success: false, error: "订单不存在" },
        { status: 404 }
      );
    }

    // 验证查询密码（游客订单）
    if (!order.userId && order.queryPassword !== password) {
      return NextResponse.json(
        { success: false, error: "查询密码错误" },
        { status: 403 }
      );
    }

    // 如果订单已支付，直接返回成功
    if (order.status !== "PENDING") {
      return NextResponse.json({
        success: true,
        status: order.status,
        paid: ["PAID", "DELIVERED", "COMPLETED"].includes(order.status),
      });
    }

    // 检查支付方式
    if (!order.paymentMethod?.startsWith("USDT")) {
      return NextResponse.json(
        { success: false, error: "非 USDT 订单" },
        { status: 400 }
      );
    }

    await requirePaymentEnabled(order.paymentMethod);

    // 创建 USDT Provider
    const network = order.paymentMethod === "USDT_TRC20" ? "trc20" : "erc20";
    const provider = new USDTProvider(network);

    // 查询区块链
    const result = await provider.queryOrder(orderNo);

    // 如果找到付款，处理订单
    if (result.status === "paid" && result.tradeNo) {
      await handlePaymentSuccess(orderNo, result.tradeNo, { method: order.paymentMethod, amount: order.payAmount });

      return NextResponse.json({
        success: true,
        status: "paid",
        paid: true,
        tradeNo: result.tradeNo,
      });
    }

    return NextResponse.json({
      success: true,
      status: "pending",
      paid: false,
    });
  } catch (error) {
    logError("USDT check", error);
    return NextResponse.json(
      {
        success: false,
        error: "查询失败，请稍后重试",
      },
      { status: 500 }
    );
  }
}
