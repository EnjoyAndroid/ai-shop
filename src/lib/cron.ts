import { cancelExpiredOrders } from "./services/order.service";

let isRunning = false;

/**
 * 启动定时任务
 */
export function startCronJobs() {
  if (isRunning) return;
  isRunning = true;

  console.log("[Cron] Starting cron jobs...");

  // 每分钟检查过期订单
  setInterval(async () => {
    try {
      const count = await cancelExpiredOrders();
      if (count > 0) {
        console.log(`[Cron] Cancelled ${count} expired orders`);
      }
    } catch (error) {
      console.error("[Cron] Error cancelling expired orders:", error);
    }
  }, 60 * 1000); // 每60秒

  console.log("[Cron] Cron jobs started");
}
