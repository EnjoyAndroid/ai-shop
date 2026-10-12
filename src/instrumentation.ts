export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs" && process.env.NEXT_PHASE !== "phase-production-build") {
    const { validateRuntimeConfig } = await import("./lib/security-config");
    validateRuntimeConfig();
    const { pendingOrderLimits } = await import("./lib/pending-orders");
    pendingOrderLimits();
    const { startCronJobs } = await import("./lib/cron");
    startCronJobs();
  }
}
