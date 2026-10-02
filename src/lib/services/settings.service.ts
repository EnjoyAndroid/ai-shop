import { logError } from "@/lib/logger";
import prisma from "@/lib/db";
import redis from "@/lib/redis";

const SETTINGS_CACHE_KEY = "system:settings";
const SETTINGS_CACHE_TTL = 300; // 5分钟缓存

// 默认设置值
const DEFAULT_SETTINGS = {
  siteName: "AI Shop",
  siteUrl: "http://localhost:3000",
  orderExpireMinutes: "10",
  orderAutoDeleteDays: "90",
  alipayEnabled: "false",
  wechatEnabled: "false",
  usdtEnabled: "false",
  balanceEnabled: "false",
  telegramUrl: "",
};

/**
 * 获取所有系统设置
 */
export async function getSettings(): Promise<Record<string, string>> {
  try {
    // 尝试从缓存获取
    const cached = await redis.get(SETTINGS_CACHE_KEY);
    if (cached) {
      return { ...DEFAULT_SETTINGS, ...JSON.parse(cached) };
    }

    // 从数据库获取
    const settingsRows = await prisma.systemSetting.findMany();
    const settings: Record<string, string> = {};
    settingsRows.forEach((row) => {
      settings[row.key] = row.value;
    });

    // 缓存设置
    if (Object.keys(settings).length > 0) {
      await redis.set(SETTINGS_CACHE_KEY, JSON.stringify(settings), "EX", SETTINGS_CACHE_TTL);
    }

    return { ...DEFAULT_SETTINGS, ...settings };
  } catch (error) {
    logError("getSettings error", error);
    return DEFAULT_SETTINGS;
  }
}

/**
 * 获取单个设置值
 */
export async function getSetting(key: string): Promise<string> {
  const settings = await getSettings();
  return settings[key] || DEFAULT_SETTINGS[key as keyof typeof DEFAULT_SETTINGS] || "";
}

/**
 * 获取订单过期时间（分钟）
 */
export async function getOrderExpireMinutes(): Promise<number> {
  const value = await getSetting("orderExpireMinutes");
  return parseInt(value) || 10;
}

/**
 * 获取订单自动删除天数
 */
export async function getOrderAutoDeleteDays(): Promise<number> {
  const value = await getSetting("orderAutoDeleteDays");
  return parseInt(value) || 90;
}

/**
 * 清除设置缓存
 */
export async function clearSettingsCache(): Promise<void> {
  await redis.del(SETTINGS_CACHE_KEY);
}
