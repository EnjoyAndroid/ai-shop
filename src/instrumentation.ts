export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs" && process.env.NEXT_PHASE !== "phase-production-build") {
    const { validateRuntimeConfig } = await import("./lib/security-config");
    validateRuntimeConfig();
    const { startCronJobs } = await import("./lib/cron");
    startCronJobs();
  }
}
