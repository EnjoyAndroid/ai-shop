import { NextRequest } from "next/server";
import { accessibleOrder, orderError, orderJson } from "@/lib/order-http";

export const dynamic = "force-dynamic";
import { handlePaymentSuccess } from "@/lib/services/order.service";
import { USDTProvider } from "@/lib/payment";
import { requirePaymentEnabled } from "@/lib/payment/config";

/**
 * USDT 支付状态查询 API
 * 前端轮询调用，自动检测区块链上的付款
 */
export async function GET(request: NextRequest) {
  try {
    const orderNo = new URL(request.url).searchParams.get("orderNo") || "";
    const order = await accessibleOrder(request, orderNo, "usdt-check");
    // 如果订单已支付，直接返回成功
    if (order.status !== "PENDING") {
      return orderJson({
        success: true,
        status: order.status,
        paid: ["PAID", "DELIVERED", "COMPLETED"].includes(order.status),
      });
    }

    // 检查支付方式
    if (!order.paymentMethod?.startsWith("USDT")) {
      return orderJson(
        { success: false, error: "非 USDT 订单" },
        400
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

      return orderJson({
        success: true,
        status: "paid",
        paid: true,
        tradeNo: result.tradeNo,
      });
    }

    return orderJson({
      success: true,
      status: "pending",
      paid: false,
    });
  } catch (error) { return orderError("USDT check", error); }
}
