import { logError } from "@/lib/logger";
/**
 * 汇率服务
 * 获取 USDT/CNY 实时汇率
 */

import redis from "@/lib/redis";

// 缓存 key 和过期时间
const RATE_CACHE_KEY = "usdt:exchange_rate";
const RATE_CACHE_TTL = 300; // 5 分钟缓存

export interface ExchangeRate {
  rate: number;
  source: string;
  updatedAt: number;
}

/**
 * 从 Binance 获取 USDT/CNY 汇率
 * 使用 P2P 接口获取市场均价
 */
async function fetchBinanceRate(): Promise<number | null> {
  try {
    // Binance P2P API - 获取 USDT 卖单均价
    const response = await fetch(
      "https://p2p.binance.com/bapi/c2c/v2/friendly/c2c/adv/search",
      {
        method: "POST",
        signal: AbortSignal.timeout(5000),
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          fiat: "CNY",
          page: 1,
          rows: 10,
          tradeType: "BUY", // 用户买入 USDT = 商家卖出
          asset: "USDT",
          payTypes: [],
          publisherType: null,
        }),
      }
    );

    if (!response.ok) {
      return null;
    }

    const data = await response.json();
    const ads = data.data || [];

    if (ads.length === 0) {
      return null;
    }

    // 计算前 5 个广告的平均价格
    const prices = ads
      .slice(0, 5)
      .map((ad: any) => parseFloat(ad.adv.price))
      .filter((p: number) => p > 0);

    if (prices.length === 0) {
      return null;
    }

    const avgPrice = prices.reduce((a: number, b: number) => a + b, 0) / prices.length;
    return parseFloat(avgPrice.toFixed(4));
  } catch (error) {
    logError("Binance rate fetch error", error);
    return null;
  }
}

/**
 * 从 OKX 获取 USDT/CNY 汇率
 */
async function fetchOKXRate(): Promise<number | null> {
  try {
    const response = await fetch(
      "https://www.okx.com/v3/c2c/tradingOrders/books?quoteCurrency=CNY&baseCurrency=USDT&side=sell&paymentMethod=all&userType=all&showTrade=false&showFollow=false&showAlreadyTraded=false&isAbleFilter=false", { signal: AbortSignal.timeout(5000) }
    );

    if (!response.ok) {
      return null;
    }

    const data = await response.json();
    const ads = data.data?.sell || [];

    if (ads.length === 0) {
      return null;
    }

    // 取前 5 个价格的平均值
    const prices = ads
      .slice(0, 5)
      .map((ad: any) => parseFloat(ad.price))
      .filter((p: number) => p > 0);

    if (prices.length === 0) {
      return null;
    }

    const avgPrice = prices.reduce((a: number, b: number) => a + b, 0) / prices.length;
    return parseFloat(avgPrice.toFixed(4));
  } catch (error) {
    logError("OKX rate fetch error", error);
    return null;
  }
}

/**
 * 获取 USDT/CNY 汇率
 * 优先从缓存获取，缓存失效则从交易所 API 获取
 */
export async function getUSDTRate(): Promise<ExchangeRate> {
  // 默认汇率（兜底）
  const defaultRate = parseFloat(process.env.USDT_EXCHANGE_RATE || "7.2");

  try {
    // 尝试从缓存获取
    const cached = await redis.get(RATE_CACHE_KEY);
    if (cached) {
      const parsed = JSON.parse(cached) as ExchangeRate;
      return parsed;
    }
  } catch (e) {
    // 缓存读取失败，继续获取实时汇率
  }

  // 依次尝试不同的数据源
  let rate: number | null = null;
  let source = "default";

  // 尝试 Binance
  rate = await fetchBinanceRate();
  if (rate) {
    source = "binance";
  }

  // 尝试 OKX
  if (!rate) {
    rate = await fetchOKXRate();
    if (rate) {
      source = "okx";
    }
  }

  // 都失败则使用默认值
  if (!rate) {
    rate = defaultRate;
    source = "default";
  }

  const result: ExchangeRate = {
    rate,
    source,
    updatedAt: Date.now(),
  };

  // 缓存结果
  try {
    await redis.set(RATE_CACHE_KEY, JSON.stringify(result), "EX", RATE_CACHE_TTL);
  } catch (e) {
    // 缓存写入失败，忽略
  }

  return result;
}

/**
 * 人民币转 USDT
 * @param cnyAmount 人民币金额（元）
 */
export async function cnyToUSDT(cnyAmount: number): Promise<{ usdt: number; rate: number }> {
  const { rate } = await getUSDTRate();
  const usdt = parseFloat((cnyAmount / rate).toFixed(2));
  return { usdt, rate };
}

/**
 * USDT 转人民币
 * @param usdtAmount USDT 金额
 */
export async function usdtToCNY(usdtAmount: number): Promise<{ cny: number; rate: number }> {
  const { rate } = await getUSDTRate();
  const cny = parseFloat((usdtAmount * rate).toFixed(2));
  return { cny, rate };
}
