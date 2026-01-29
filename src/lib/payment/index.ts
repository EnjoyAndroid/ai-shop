import { hashMD5 } from "@/lib/encryption";
import { spawn } from "child_process";

/**
 * 使用 curl 发送 POST 请求（通过 spawn 异步执行）
 */
function curlPost(url: string, data: Record<string, string>): Promise<any> {
  return new Promise((resolve, reject) => {
    const postData = new URLSearchParams(data).toString();

    const curl = spawn("curl", [
      "-s",
      "-X", "POST",
      url,
      "-d", postData,
      "--max-time", "30"
    ]);

    let stdout = "";
    let stderr = "";

    curl.stdout.on("data", (data) => {
      stdout += data.toString();
    });

    curl.stderr.on("data", (data) => {
      stderr += data.toString();
    });

    curl.on("close", (code) => {
      console.log("Xunhu API response:", stdout);

      if (stderr) {
        console.error("curl stderr:", stderr);
      }

      if (!stdout.trim()) {
        reject(new Error("空响应"));
        return;
      }

      try {
        resolve(JSON.parse(stdout));
      } catch {
        reject(new Error(`JSON解析失败: ${stdout}`));
      }
    });

    curl.on("error", (err) => {
      reject(new Error(`curl执行失败: ${err.message}`));
    });
  });
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

  async createPayment(params: CreatePaymentParams): Promise<PaymentResult> {
    const { amount } = params;

    // USDT 金额 (假设 1 USDT = 7.2 CNY)
    const usdtAmount = (amount / 100 / 7.2).toFixed(2);

    return {
      success: true,
      payUrl: `${this.network}:${this.address}?amount=${usdtAmount}`,
      qrCode: this.address,
    };
  }

  async verifyCallback(params: Record<string, string>): Promise<CallbackResult> {
    // USDT 支付通过区块链监听验证
    // 这里返回待人工确认状态
    return {
      success: false,
      errorMsg: "USDT 支付需要人工确认",
    };
  }

  async queryOrder(_orderNo: string): Promise<QueryResult> {
    // 需要查询区块链
    return {
      success: true,
      status: "pending",
    };
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
