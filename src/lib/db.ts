import { PrismaClient } from "@prisma/client";
import { startCronJobs } from "./cron";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
  cronStarted?: boolean;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log:
      process.env.NODE_ENV === "development"
        ? ["query", "error", "warn"]
        : ["error"],
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

// 启动定时任务（只执行一次）
if (typeof window === "undefined" && !globalForPrisma.cronStarted) {
  globalForPrisma.cronStarted = true;
  startCronJobs();
}

export default prisma;
