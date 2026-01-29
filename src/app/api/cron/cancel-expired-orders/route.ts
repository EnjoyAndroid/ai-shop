import { NextRequest, NextResponse } from "next/server";
import { cancelExpiredOrders } from "@/lib/services/order.service";

// Vercel Cron 或外部调用
export async function GET(request: NextRequest) {
  try {
    // 验证 cron secret（可选，用于安全）
    const authHeader = request.headers.get("authorization");
    const cronSecret = process.env.CRON_SECRET;

    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const count = await cancelExpiredOrders();

    console.log(`[Cron] Cancelled ${count} expired orders`);

    return NextResponse.json({
      success: true,
      cancelled: count,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("[Cron] Cancel expired orders error:", error);
    return NextResponse.json(
      { error: "Failed to cancel expired orders" },
      { status: 500 }
    );
  }
}
