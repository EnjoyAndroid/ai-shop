import { hashMD5 } from "@/lib/encryption";

/**
 * 发送 POST 请求
 */
async function curlPost(url: string, data: Record<string, string>): Promise<any> {
  const postData = new URLSearchParams(data).toString();
  console.log("[Payment] Request URL:", url);
  console.log("[Payment] Request data:", postData);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: postData,
      signal: controller.signal,
    });

    console.log("[Payment] Response status:", response.status);
    const text = await response.text();
    console.log("[Payment] Response body:", text);

    if (!text.trim()) {
      throw new Error("空响应");
    }

    try {
      return JSON.parse(text);
    } catch {
      throw new Error(`JSON解析失败: ${text}`);
    }
  } catch (error) {
    console.error("[Payment] Fetch error:", error);
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("请求超时");
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

export interface PaymentProvider {
  name: string;
  createPayment(params: CreatePaymentParams): Promise<PaymentResult>;
  verifyCallback(params: Record<string, string>): Promise<CallbackResult>;
  queryOrder(orderNo: string): Promise<QueryResult>;
}

export interface CreatePaymentParams {
  orderNo: string;
  amount: number; // 分
  subject: string;
  notifyUrl: string;
  returnUrl: string;
}

export interface PaymentResult {
  success: boolean;
  payUrl?: string;
  qrCode?: string;
  errorMsg?: string;
}

export interface CallbackResult {
  success: boolean;
  orderNo?: string;
  tradeNo?: string;
  amount?: number;
  errorMsg?: string;
}

export interface QueryResult {
  success: boolean;
  status: "pending" | "paid" | "failed";
  tradeNo?: string;
  errorMsg?: string;
}

/**
 * 虎皮椒支付 (支付宝/微信)
 * 文档: https://www.xunhupay.com/doc/api/index.html
 */
export class XunhuPayProvider implements PaymentProvider {
  name = "xunhu";

  private appId: string;
  private appSecret: string;
  private gateway: string;
  private channel: "alipay" | "wechat";

  constructor(channel: "alipay" | "wechat") {
    this.channel = channel;

    if (channel === "alipay") {
      this.appId = process.env.XUNHU_ALIPAY_APPID || "";
      this.appSecret = process.env.XUNHU_ALIPAY_APPSECRET || "";
    } else {
      this.appId = process.env.XUNHU_WECHAT_APPID || "";
      this.appSecret = process.env.XUNHU_WECHAT_APPSECRET || "";
    }

    this.gateway = process.env.XUNHU_GATEWAY || "https://api.xunhupay.com/payment/do.html";
  }

  async createPayment(params: CreatePaymentParams): Promise<PaymentResult> {
    const { orderNo, amount, subject, notifyUrl, returnUrl } = params;

    const data: Record<string, string> = {
      version: "1.1",
      appid: this.appId,
      trade_order_id: orderNo,
      payment: this.channel,
      total_fee: (amount / 100).toFixed(2),
      title: subject,
      time: Math.floor(Date.now() / 1000).toString(),
      notify_url: notifyUrl,
      return_url: returnUrl,
      nonce_str: Math.random().toString(36).slice(2),
    };

    // 生成签名
    data.hash = this.generateSign(data);

    try {
      const result = await curlPost(this.gateway, data);

      if (result.errcode === 0) {
        return {
          success: true,
          payUrl: result.url,
          qrCode: result.url_qrcode,
        };
      } else {
        return {
          success: false,
          errorMsg: result.errmsg || "创建支付失败",
        };
      }
    } catch (error) {
      return {
        success: false,
        errorMsg: error instanceof Error ? error.message : "网络错误",
      };
    }
  }

  async verifyCallback(params: Record<string, string>): Promise<CallbackResult> {
    const { hash, ...data } = params;

    // 验证签名
    const expectedHash = this.generateSign(data);
    if (hash !== expectedHash) {
      return {
        success: false,
        errorMsg: "签名验证失败",
      };
    }

    if (data.status === "OD") {
      return {
        success: true,
        orderNo: data.trade_order_id,
        tradeNo: data.transaction_id,
        amount: Math.round(parseFloat(data.total_fee) * 100),
      };
    }

    return {
      success: false,
      errorMsg: "支付未完成",
    };
  }

  async queryOrder(orderNo: string): Promise<QueryResult> {
    const data: Record<string, string> = {
      appid: this.appId,
      out_trade_order: orderNo,
      time: Math.floor(Date.now() / 1000).toString(),
      nonce_str: Math.random().toString(36).slice(2),
    };

    data.hash = this.generateSign(data);

    try {
      const result = await curlPost("https://api.xunhupay.com/payment/query.html", data);

      if (result.errcode === 0 && result.status === "OD") {
        return {
          success: true,
          status: "paid",
          tradeNo: result.transaction_id,
        };
      }

      return {
        success: true,
        status: "pending",
      };
    } catch (error) {
      return {
        success: false,
        status: "pending",
        errorMsg: error instanceof Error ? error.message : "查询失败",
      };
    }
  }

  private generateSign(data: Record<string, string>): string {
    // 按字母排序
    const keys = Object.keys(data).sort();
    const signStr = keys
      .filter((k) => data[k] !== "" && k !== "hash")
      .map((k) => `${k}=${data[k]}`)
      .join("&");

    return hashMD5(signStr + this.appSecret);
  }
}

/**
 * USDT TRC20 支付
 * 支持通过 TronGrid API 自动验证付款
 * 支持实时汇率查询
 */
export class USDTProvider implements PaymentProvider {
  name = "usdt";

  private address: string;
  private network: "trc20" | "erc20";

  constructor(network: "trc20" | "erc20" = "trc20") {
    this.network = network;
    this.address =
      network === "trc20"
        ? process.env.USDT_TRC20_ADDRESS || ""
        : process.env.USDT_ERC20_ADDRESS || "";
  }

  /**
   * 生成带小数尾数的 USDT 金额，用于区分不同订单
   * 例如: 10.00 -> 10.001, 10.002, 10.003 等
   * 尾数范围: 0.001 - 0.099 (小于1毛钱)
   */
  generateUniqueAmount(baseAmount: number, orderNo: string): number {
    // 使用订单号生成一个 1-99 的尾数（作为第三位小数）
    const hash = orderNo.split("").reduce((acc, char) => acc + char.charCodeAt(0), 0);
    const suffix = (hash % 99) + 1; // 1-99
    // 加在小数点后第三位，范围 0.001-0.099
    return parseFloat((baseAmount + suffix / 1000).toFixed(3));
  }

  async createPayment(params: CreatePaymentParams): Promise<PaymentResult> {
    const { amount, orderNo } = params;

    // 使用实时汇率
    const { cnyToUSDT } = await import("@/lib/exchange-rate");
    const { usdt: baseAmount, rate } = await cnyToUSDT(amount / 100);

    // 添加唯一尾数以便识别订单
    const usdtAmount = this.generateUniqueAmount(baseAmount, orderNo);

    return {
      success: true,
      payUrl: `${this.network}:${this.address}?amount=${usdtAmount}`,
      qrCode: this.address,
      // 额外返回 USDT 金额和汇率供前端显示
      usdtAmount,
      exchangeRate: rate,
    } as PaymentResult & { usdtAmount: number; exchangeRate: number };
  }

  async verifyCallback(params: Record<string, string>): Promise<CallbackResult> {
    const { txHash, orderNo, expectedAmount } = params;

    if (!txHash) {
      return {
        success: false,
        errorMsg: "缺少交易哈希",
      };
    }

    try {
      // 动态导入 TronGrid 客户端
      const { isTransactionConfirmed } = await import("@/lib/trongrid");

      const confirmed = await isTransactionConfirmed(txHash);
      if (!confirmed) {
        return {
          success: false,
          errorMsg: "交易未确认或失败",
        };
      }

      return {
        success: true,
        orderNo,
        tradeNo: txHash,
        amount: expectedAmount ? parseInt(expectedAmount) : undefined,
      };
    } catch (error) {
      return {
        success: false,
        errorMsg: error instanceof Error ? error.message : "验证失败",
      };
    }
  }

  /**
   * 查询订单支付状态
   * 通过 TronGrid API 查询区块链上是否有匹配的 USDT 转账
   */
  async queryOrder(
    orderNo: string,
    options?: { expectedAmount?: number; createdAt?: number }
  ): Promise<QueryResult> {
    // 如果是 ERC20，暂不支持自动查询
    if (this.network === "erc20") {
      return {
        success: true,
        status: "pending",
        errorMsg: "ERC20 暂不支持自动查询，请联系客服确认",
      };
    }

    if (!this.address) {
      return {
        success: false,
        status: "pending",
        errorMsg: "未配置收款地址",
      };
    }

    try {
      const { findUSDTPayment, getTRC20Transfers } = await import("@/lib/trongrid");
      const { cnyToUSDT } = await import("@/lib/exchange-rate");

      // 默认查询最近 30 分钟的交易
      const sinceTimestamp = options?.createdAt || Date.now() - 30 * 60 * 1000;

      // 计算预期金额
      let expectedAmount = options?.expectedAmount;
      if (!expectedAmount) {
        // 如果没有传入预期金额，返回 pending
        return {
          success: true,
          status: "pending",
        };
      }

      // 将人民币分转为 USDT（使用实时汇率）
      const { usdt: baseUsdt } = await cnyToUSDT(expectedAmount / 100);
      const usdtAmount = this.generateUniqueAmount(baseUsdt, orderNo);

      console.log(`[USDT Check] orderNo=${orderNo}, expectedCNY=${expectedAmount/100}, usdtAmount=${usdtAmount}, address=${this.address}`);

      // 查找匹配的交易
      const tx = await findUSDTPayment(
        this.address,
        usdtAmount,
        sinceTimestamp,
        0.01 // 容差 0.01 USDT
      );

      if (tx) {
        return {
          success: true,
          status: "paid",
          tradeNo: tx.transaction_id,
        };
      }

      return {
        success: true,
        status: "pending",
      };
    } catch (error) {
      console.error("USDT queryOrder error:", error);
      return {
        success: false,
        status: "pending",
        errorMsg: error instanceof Error ? error.message : "查询失败",
      };
    }
  }
}

/**
 * 余额支付
 */
export class BalanceProvider implements PaymentProvider {
  name = "balance";

  async createPayment(_params: CreatePaymentParams): Promise<PaymentResult> {
    // 余额支付直接在订单创建时处理
    return {
      success: true,
    };
  }

  async verifyCallback(_params: Record<string, string>): Promise<CallbackResult> {
    return {
      success: true,
    };
  }

  async queryOrder(_orderNo: string): Promise<QueryResult> {
    return {
      success: true,
      status: "paid",
    };
  }
}

/**
 * 支付工厂
 */
export function getPaymentProvider(method: string): PaymentProvider {
  switch (method) {
    case "ALIPAY":
      return new XunhuPayProvider("alipay");
    case "WECHAT":
      return new XunhuPayProvider("wechat");
    case "USDT_TRC20":
      return new USDTProvider("trc20");
    case "USDT_ERC20":
      return new USDTProvider("erc20");
    case "BALANCE":
      return new BalanceProvider();
    default:
      throw new Error(`不支持的支付方式: ${method}`);
  }
}
