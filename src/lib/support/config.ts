import { getSettings } from "@/lib/services/settings.service";

export interface SupportConfig {
  provider: string;
  baseUrl: string;
  model: string;
  wireApi: "responses" | "chat_completions";
  apiKey: string;
  dailyBudgetCny: number;
  usdCnyRate: number;
  inputUsdPerMillion: number;
  cachedInputUsdPerMillion: number;
  cacheWriteUsdPerMillion: number;
  outputUsdPerMillion: number;
}

function numberEnv(name: string, fallback: number): number {
  if (!process.env[name]?.trim()) return fallback;
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value >= 0 ? value : fallback;
}

export async function getSupportConfig(): Promise<SupportConfig> {
  const settings = await getSettings();
  return {
    provider: process.env.SUPPORT_LLM_PROVIDER || "sub2api",
    baseUrl: (process.env.SUPPORT_LLM_BASE_URL || "http://127.0.0.1:8080/v1").replace(/\/$/, ""),
    model: settings.supportLlmModel || process.env.SUPPORT_LLM_MODEL || "gpt-6-luna",
    wireApi: process.env.SUPPORT_LLM_WIRE_API === "chat_completions" ? "chat_completions" : "responses",
    apiKey: process.env.SUPPORT_LLM_API_KEY || "",
    dailyBudgetCny: numberEnv("SUPPORT_DAILY_BUDGET_CNY", Number(settings.supportDailyBudgetCny || 10)),
    usdCnyRate: numberEnv("SUPPORT_USD_CNY_RATE", 7.2),
    inputUsdPerMillion: numberEnv("SUPPORT_LLM_INPUT_USD_PER_MILLION", 0.1),
    cachedInputUsdPerMillion: numberEnv("SUPPORT_LLM_CACHED_INPUT_USD_PER_MILLION", 0.01),
    cacheWriteUsdPerMillion: numberEnv("SUPPORT_LLM_CACHE_WRITE_USD_PER_MILLION", 0.125),
    outputUsdPerMillion: numberEnv("SUPPORT_LLM_OUTPUT_USD_PER_MILLION", 0.5),
  };
}

export function supportModelConfigured(config: SupportConfig): boolean {
  return Boolean(config.apiKey && config.baseUrl && config.model);
}

export function redactSupportText(value: string): string {
  return value
    .replace(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/g, "[邮箱]")
    .replace(/\b(?:AS|R)\d{8,}\b/gi, "[订单号]")
    .replace(/\b[a-f0-9]{32,}\b/gi, "[凭证]")
    .replace(/(?:(?:密码|口令|token|key)\s*[:：]\s*|\b(?:token|key)\s+)[^\s，。；、]+/gi, "[凭据已隐藏]")
    .slice(0, 4000);
}

export function dayStartShanghai(now = new Date()): Date {
  const formatter = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit" });
  const day = formatter.format(now);
  return new Date(`${day}T00:00:00+08:00`);
}

