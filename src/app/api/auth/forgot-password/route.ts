import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import prisma from "@/lib/db";
import redis from "@/lib/redis";
import nodemailer from "nodemailer";

// 创建邮件发送器
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT) || 465,
  secure: true,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

export async function POST(request: NextRequest) {
  try {
    const { email } = await request.json();

    if (!email) {
      return NextResponse.json({ error: "请输入邮箱" }, { status: 400 });
    }

    // 查找用户
    const user = await prisma.user.findUnique({
      where: { email },
    });

    // 即使用户不存在也返回成功（防止邮箱枚举攻击）
    if (!user) {
      return NextResponse.json({ success: true });
    }

    // 生成重置 token
    const token = crypto.randomBytes(32).toString("hex");
    const expireTime = 30 * 60; // 30 分钟

    // 存储到 Redis（使用 setex 确保过期时间生效）
    await redis.setex(`reset_password:${token}`, expireTime, user.id);

    // 发送重置邮件
    const resetUrl = `${process.env.NEXT_PUBLIC_SITE_URL}/reset-password?token=${token}`;

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>重置密码 - AI Shop</title>
      </head>
      <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f9fafb; padding: 40px 20px;">
        <div style="max-width: 600px; margin: 0 auto; background: white; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">

          <div style="background: linear-gradient(135deg, #6366f1, #8b5cf6); padding: 30px; text-align: center;">
            <h1 style="color: white; margin: 0; font-size: 24px;">🔐 重置密码</h1>
          </div>

          <div style="padding: 30px;">
            <p style="color: #333; font-size: 16px; margin-bottom: 20px;">
              您好，您正在申请重置 AI Shop 账号密码。
            </p>

            <p style="color: #666; font-size: 14px; margin-bottom: 20px;">
              请点击下方按钮重置您的密码，链接有效期为 30 分钟。
            </p>

            <div style="text-align: center; margin: 30px 0;">
              <a href="${resetUrl}"
                 style="display: inline-block; padding: 14px 32px; background: #6366f1; color: white; text-decoration: none; border-radius: 8px; font-weight: bold;">
                重置密码
              </a>
            </div>

            <p style="color: #999; font-size: 12px; margin-top: 30px;">
              如果按钮无法点击，请复制以下链接到浏览器打开：<br>
              <a href="${resetUrl}" style="color: #6366f1; word-break: break-all;">${resetUrl}</a>
            </p>

            <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee;">
              <p style="color: #999; font-size: 12px; margin: 0;">
                如果您没有申请重置密码，请忽略此邮件。
              </p>
            </div>
          </div>

        </div>
      </body>
      </html>
    `;

    await transporter.sendMail({
      from: `"AI Shop" <${process.env.MAIL_FROM}>`,
      to: email,
      subject: "【AI Shop】重置密码",
      html,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Forgot password error:", error);
    return NextResponse.json({ error: "发送失败，请稍后重试" }, { status: 500 });
  }
}
