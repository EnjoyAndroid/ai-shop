import { logError } from "@/lib/logger";
/**
 * Telegram 通知服务
 */

const TELEGRAM_API = "https://api.telegram.org/bot";

interface OrderNotification {
  orderNo: string;
  email: string;
  phone?: string;
  payAmount: number;
  paymentMethod: string;
  items: {
    productName: string;
    quantity: number;
    price: number;
  }[];
}

/**
 * 发送 Telegram 消息
 */
async function sendTelegramMessage(text: string): Promise<boolean> {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;

  if (!botToken || !chatId) {
    return false;
  }

  try {
    const response = await fetch(`${TELEGRAM_API}${botToken}/sendMessage`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: "HTML",
      }),
    });

    const result = await response.json();

    if (!result.ok) {
      logError("Telegram API error", result);
      return false;
    }
    return true;
  } catch (error) {
    logError("Telegram send error", error);
    return false;
  }
}

/**
 * 发送支付成功通知
 */
export async function sendPaymentSuccessTelegram(order: OrderNotification): Promise<boolean> {
  const itemsList = order.items
    .map((item) => `  • ${item.productName} × ${item.quantity}`)
    .join("\n");

  const message = `
🎉 <b>新订单支付成功</b>

📋 <b>订单号:</b> <code>${order.orderNo}</code>
💰 <b>支付金额:</b> ¥${(order.payAmount / 100).toFixed(2)}
💳 <b>支付方式:</b> ${order.paymentMethod}

📧 <b>联系邮箱:</b> ${order.email || "-"}
📱 <b>联系手机:</b> ${order.phone || "-"}

🛒 <b>商品明细:</b>
${itemsList}

⏰ <b>时间:</b> ${new Date().toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" })}
`.trim();

  return sendTelegramMessage(message);
}

/**
 * 发送库存预警通知
 */
export async function sendLowStockTelegram(productName: string, stock: number): Promise<boolean> {
  const message = `
⚠️ <b>库存预警</b>

商品 <b>${productName}</b> 库存不足！

当前库存: <b>${stock}</b> 件

请及时补充库存。
`.trim();

  return sendTelegramMessage(message);
}

/**
 * 发送通用通知
 */
export async function sendTelegramNotification(title: string, content: string): Promise<boolean> {
  const message = `
📢 <b>${title}</b>

${content}

⏰ ${new Date().toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" })}
`.trim();

  return sendTelegramMessage(message);
}
