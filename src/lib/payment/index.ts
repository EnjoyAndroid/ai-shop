import { timingSafeEqual, randomBytes } from "crypto";
import { hashMD5 } from "@/lib/encryption";
import { logError } from "@/lib/logger";

export interface CreatePaymentParams { orderNo: string; amount: number; subject: string; notifyUrl: string; returnUrl: string; }
export interface PaymentResult { success: boolean; payUrl?: string; qrCode?: string; usdtAmount?: number; exchangeRate?: number; errorMsg?: string; }
export interface CallbackResult { success: boolean; orderNo?: string; tradeNo?: string; amount?: number; errorMsg?: string; }
export interface QueryResult { success: boolean; status: "pending" | "paid" | "failed"; tradeNo?: string; errorMsg?: string; }
export interface PaymentProvider {
  name: string;
  createPayment(params: CreatePaymentParams): Promise<PaymentResult>;
  verifyCallback(params: Record<string, string>): Promise<CallbackResult>;
  queryOrder(orderNo: string): Promise<QueryResult>;
}

async function post(url: string, data: Record<string, string>) {
  if (new URL(url).protocol !== "https:") throw new Error("支付网关必须使用 HTTPS");
  const response = await fetch(url, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams(data), signal: AbortSignal.timeout(15000), redirect: "error" });
  if (!response.ok) throw new Error("支付服务暂不可用");
  return response.json();
}

export class XunhuPayProvider implements PaymentProvider {
  name = "xunhu";
  private appId: string;
  private appSecret: string;
  constructor(private channel: "alipay" | "wechat") {
    this.appId = (channel === "alipay" ? process.env.XUNHU_ALIPAY_APPID : process.env.XUNHU_WECHAT_APPID) || "";
    this.appSecret = (channel === "alipay" ? process.env.XUNHU_ALIPAY_APPSECRET : process.env.XUNHU_WECHAT_APPSECRET) || "";
  }
  private configured() { return Boolean(this.appId && this.appSecret); }
  private sign(data: Record<string, string>): string {
    if (!this.configured()) throw new Error("支付通道未配置");
    return hashMD5(Object.keys(data).sort().filter(k => k !== "hash" && data[k] !== "").map(k => `${k}=${data[k]}`).join("&") + this.appSecret);
  }
  async createPayment(params: CreatePaymentParams): Promise<PaymentResult> {
    if (!this.configured()) return { success: false, errorMsg: "支付通道未配置" };
    if (!Number.isSafeInteger(params.amount) || params.amount <= 0) return { success: false, errorMsg: "无效金额" };
    const data: Record<string, string> = { version: "1.1", appid: this.appId, trade_order_id: params.orderNo, payment: this.channel, total_fee: (params.amount / 100).toFixed(2), title: params.subject, time: Math.floor(Date.now() / 1000).toString(), notify_url: params.notifyUrl, return_url: params.returnUrl, nonce_str: randomBytes(16).toString("hex") };
    data.hash = this.sign(data);
    try {
      const result = await post(process.env.XUNHU_GATEWAY || "https://api.xunhupay.com/payment/do.html", data);
      if (result.errcode !== 0) return { success: false, errorMsg: "创建支付失败，请稍后重试" };
      const payUrl = new URL(result.url);
      if (payUrl.protocol !== "https:") throw new Error("支付地址无效");
      return { success: true, payUrl: payUrl.toString(), qrCode: result.url_qrcode };
    } catch (error) { logError("Create payment", error); return { success: false, errorMsg: "支付服务暂不可用" }; }
  }
  async verifyCallback(params: Record<string, string>): Promise<CallbackResult> {
    if (!this.configured()) return { success: false, errorMsg: "支付通道未配置" };
    const { hash, ...data } = params;
    const expected = this.sign(data);
    if (!/^[a-fA-F0-9]{32}$/.test(hash || "") || !timingSafeEqual(Buffer.from(hash.toLowerCase()), Buffer.from(expected))) return { success: false, errorMsg: "签名验证失败" };
    if (data.status !== "OD" || (data.appid && data.appid !== this.appId) || (data.payment && data.payment !== this.channel) || (data.currency && data.currency !== "CNY")) return { success: false, errorMsg: "支付通道或状态不符" };
    if (!data.trade_order_id || data.trade_order_id.length > 100 || !data.transaction_id || data.transaction_id.length > 200 || !/^\d{1,8}(\.\d{1,2})?$/.test(data.total_fee || "")) return { success: false, errorMsg: "回调参数无效" };
    const [whole, fraction = ""] = data.total_fee.split(".");
    const amount = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
    if (!Number.isSafeInteger(amount) || amount <= 0) return { success: false, errorMsg: "回调金额无效" };
    return { success: true, orderNo: data.trade_order_id, tradeNo: data.transaction_id, amount };
  }
  async queryOrder(_orderNo: string): Promise<QueryResult> {
    return { success: false, status: "pending", errorMsg: "请等待支付回调" };
  }
}

export class USDTProvider implements PaymentProvider {
  name = "usdt";
  constructor(private network: "trc20" | "erc20" = "trc20") {}
  async createPayment(params: CreatePaymentParams): Promise<PaymentResult> {
    if (this.network !== "trc20") return { success: false, errorMsg: "该网络暂不支持自动收款" };
    const { getOrCreateQuote } = await import("./usdt");
    const quote = await getOrCreateQuote(params.orderNo, params.amount);
    return { success: true, payUrl: `trc20:${quote.address}?amount=${Number(quote.amountMicros) / 1000000}`, qrCode: quote.address, usdtAmount: Number(quote.amountMicros) / 1000000, exchangeRate: Number(quote.exchangeRate) };
  }
  async verifyCallback(_params: Record<string, string>): Promise<CallbackResult> {
    return { success: false, errorMsg: "USDT 仅接受服务端链上验证" };
  }
  async queryOrder(orderNo: string): Promise<QueryResult> {
    if (this.network !== "trc20") return { success: false, status: "pending" };
    const { queryUSDTPayment } = await import("./usdt");
    return queryUSDTPayment(orderNo);
  }
}

export function getPaymentProvider(method: string): PaymentProvider {
  if (method === "ALIPAY") return new XunhuPayProvider("alipay");
  if (method === "WECHAT") return new XunhuPayProvider("wechat");
  if (method === "USDT_TRC20") return new USDTProvider("trc20");
  throw new Error("不支持的支付方式");
}
