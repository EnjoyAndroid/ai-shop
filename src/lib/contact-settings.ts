import { z } from "zod";
import { qrImageUrlSchema } from "./qr-settings";
import { wechatGroupExpiresAtSchema } from "./community-settings";

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

export const contactSettingsSchema = z.object({
  telegramUrl: telegramUrlSchema,
  wechatSupportText: z.string().trim().max(300, "微信客服文字最多300个字符"),
  wechatSupportQrUrl: qrImageUrlSchema,
  wechatGroupQrUrl: qrImageUrlSchema,
  wechatGroupExpiresAt: wechatGroupExpiresAtSchema,
}).strict();
export const CONTACT_SETTING_KEYS = Object.keys(contactSettingsSchema.shape);
export const EMPTY_CONTACT_SETTINGS = {
  telegramUrl: "", wechatSupportText: "", wechatSupportQrUrl: "", wechatGroupQrUrl: "", wechatGroupExpiresAt: "",
};
export type AdminContactSettings = z.infer<typeof contactSettingsSchema>;
export interface PublicContactSettings { telegramUrl: string; wechatSupportText: string; wechatSupportQrUrl: string; }

export function getPublicContactSettings(settings: Record<string, unknown>): PublicContactSettings {
  const text = contactSettingsSchema.shape.wechatSupportText.safeParse(settings.wechatSupportText || "");
  const qr = qrImageUrlSchema.safeParse(settings.wechatSupportQrUrl || "");
  return { telegramUrl: getSafeTelegramUrl(settings.telegramUrl), wechatSupportText: text.success ? text.data : "", wechatSupportQrUrl: qr.success ? qr.data : "" };
}
