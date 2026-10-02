import { z } from "zod";

// 接受用户名或 Telegram 官方链接；不允许任意协议、查询参数或其他域名。
export const telegramUrlSchema = z.string().trim().max(100).transform((value, ctx) => {
  if (!value) return "";
  const username = value.replace(/^https:\/\/t\.me\//i, "").replace(/^@/, "").replace(/\/$/, "");
  if (!/^[A-Za-z][A-Za-z0-9_]{4,31}$/.test(username)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "请输入有效的 Telegram 用户名或 https://t.me/用户名" });
    return z.NEVER;
  }
  return `https://t.me/${username}`;
});

export function getSafeTelegramUrl(value: unknown): string {
  const result = telegramUrlSchema.safeParse(value);
  return result.success ? result.data : "";
}
