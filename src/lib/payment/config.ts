import type { PaymentMethod } from "@prisma/client";
import { getSetting } from "@/lib/services/settings.service";

export function isPaymentConfigured(method: PaymentMethod): boolean {
  if (method === "BALANCE") return true;
  if (method === "ALIPAY") return Boolean(process.env.XUNHU_ALIPAY_APPID && process.env.XUNHU_ALIPAY_APPSECRET);
  if (method === "WECHAT") return Boolean(process.env.XUNHU_WECHAT_APPID && process.env.XUNHU_WECHAT_APPSECRET);
  if (method === "USDT_TRC20") return /^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(process.env.USDT_TRC20_ADDRESS || "");
  return false; // ERC20 未实现链上核验，不开放自动收款。
}

export async function isPaymentEnabled(method: PaymentMethod, signal?: AbortSignal): Promise<boolean> {
  const settings = { ALIPAY: "alipayEnabled", WECHAT: "wechatEnabled", USDT_TRC20: "usdtEnabled", USDT_ERC20: "usdtEnabled", BALANCE: "balanceEnabled" };
  signal?.throwIfAborted();
  return isPaymentConfigured(method) && await getSetting(settings[method], signal) === "true";
}

export async function requirePaymentEnabled(method: PaymentMethod): Promise<void> {
  if (!await isPaymentEnabled(method)) throw new Error("该支付方式未启用或配置不完整");
}
