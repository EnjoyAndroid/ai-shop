import { cancelExpiredOrders } from "./services/order.service";
import { logError, logInfo } from "./logger";

let isRunning = false;

/**
 * 启动定时任务
 */
export function startCronJobs() {
  if (isRunning) return;
  isRunning = true;

  logInfo("Cron", "Starting cron jobs");

  // 每分钟检查过期订单
  setInterval(async () => {
    try {
      const count = await cancelExpiredOrders();
      if (count > 0) {
        logInfo("Cron", `Cancelled ${count} expired orders`);
      }
    } catch (error) {
      logError("Cancel expired orders", error);
    }
  }, 60 * 1000).unref();
}
