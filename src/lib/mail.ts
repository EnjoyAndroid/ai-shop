import { logError } from "@/lib/logger";
import nodemailer from "nodemailer";

// 创建邮件发送器
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT) || 465,
  secure: Number(process.env.SMTP_PORT || 465) === 465, // 使用 SSL
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

interface OrderEmailParams {
  to: string;
  orderNo: string;
  items: {
    productName: string;
    cardKeys: string[];
  }[];
  totalAmount: number;
}

/**
 * 发送支付成功邮件（包含卡密）
 */
export async function sendPaymentSuccessEmail(params: OrderEmailParams): Promise<boolean> {
  const { to, orderNo, items, totalAmount } = params;

  // 生成卡密列表 HTML
  const cardKeysHtml = items
    .map(
      (item) => `
        <div style="margin-bottom: 20px;">
          <h3 style="color: #333; margin-bottom: 10px;">${item.productName}</h3>
          ${item.cardKeys
            .map(
              (key, index) => `
                <div style="background: #f5f5f5; padding: 12px; border-radius: 6px; margin-bottom: 8px; font-family: monospace; word-break: break-all;">
                  ${key}
                </div>
              `
            )
            .join("")}
        </div>
      `
    )
    .join("");

  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <title>支付成功 - AI Shop</title>
    </head>
    <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f9fafb; padding: 40px 20px;">
      <div style="max-width: 600px; margin: 0 auto; background: white; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">

        <!-- 头部 -->
        <div style="background: linear-gradient(135deg, #6366f1, #8b5cf6); padding: 30px; text-align: center;">
          <h1 style="color: white; margin: 0; font-size: 24px;">🎉 支付成功</h1>
          <p style="color: rgba(255,255,255,0.9); margin: 10px 0 0;">感谢您的购买！</p>
        </div>

        <!-- 内容 -->
        <div style="padding: 30px;">

          <!-- 订单信息 -->
          <div style="background: #f0f9ff; border: 1px solid #bae6fd; border-radius: 8px; padding: 16px; margin-bottom: 24px;">
            <h2 style="color: #0369a1; margin: 0 0 12px; font-size: 16px;">📋 订单信息</h2>
            <table style="width: 100%; font-size: 14px;">
              <tr>
                <td style="color: #666; padding: 4px 0;">订单号：</td>
                <td style="color: #333; font-weight: bold; font-family: monospace;">${orderNo}</td>
              </tr>
              <tr>
                <td style="color: #666; padding: 4px 0;">支付金额：</td>
                <td style="color: #333; font-weight: bold;">¥${(totalAmount / 100).toFixed(2)}</td>
              </tr>
            </table>
          </div>

          <!-- 卡密信息 -->
          <div style="background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px; padding: 16px; margin-bottom: 24px;">
            <h2 style="color: #15803d; margin: 0 0 16px; font-size: 16px;">🔑 您的卡密</h2>
            ${cardKeysHtml}
          </div>

          <!-- 提示 -->
          <div style="background: #fffbeb; border: 1px solid #fde68a; border-radius: 8px; padding: 16px;">
            <p style="color: #92400e; margin: 0; font-size: 14px;">
              <strong>💡 温馨提示：</strong><br>
              • 请妥善保管您的卡密和查询密码<br>
              • 如有问题，请访问网站联系客服<br>
              • 订单查询地址：<a href="${process.env.NEXT_PUBLIC_SITE_URL}/order" style="color: #6366f1;">${process.env.NEXT_PUBLIC_SITE_URL}/order</a>
            </p>
          </div>

        </div>

        <!-- 底部 -->
        <div style="background: #f9fafb; padding: 20px; text-align: center; border-top: 1px solid #e5e7eb;">
          <p style="color: #9ca3af; margin: 0; font-size: 12px;">
            此邮件由 AI Shop 系统自动发送，请勿回复
          </p>
        </div>

      </div>
    </body>
    </html>
  `;

  try {
    await transporter.sendMail({
      from: `"AI Shop" <${process.env.MAIL_FROM}>`,
      to,
      subject: `【AI Shop】支付成功 - 订单 ${orderNo}`,
      html,
    });
    return true;
  } catch (error) {
    logError("Send email error", error);
    return false;
  }
}
