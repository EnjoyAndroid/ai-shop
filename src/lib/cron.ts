import { cancelExpiredOrders } from "./services/order.service";
import { logError, logInfo } from "./logger";
import { cleanupSupportData } from "./support/service";

let isRunning = false;
let lastSupportCleanup = 0;

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
      if (Date.now() - lastSupportCleanup > 60 * 60 * 1000) {
        lastSupportCleanup = Date.now();
        const cleaned = await cleanupSupportData();
        if (cleaned.turns || cleaned.calls) logInfo("Cron", `Cleaned ${cleaned.turns} support turns and ${cleaned.calls} model calls`);
      }
    } catch (error) {
      logError("Cancel expired orders", error);
    }
  }, 60 * 1000).unref();
}
