import { z } from "zod";
import { qrImageUrlSchema } from "./qr-settings";

export const wechatGroupQrUrlSchema = qrImageUrlSchema;

export const wechatGroupExpiresAtSchema = z.union([
  z.literal(""),
  z.string().datetime({ offset: true, message: "二维码过期时间无效" }),
]);

export interface CommunitySettings {
  status: "active" | "support" | "expired" | "unconfigured";
  qrCodeUrl: string;
  expiresAt: string;
  supportQrCodeUrl: string;
}

/** Reused in the browser so an open page switches at expiry, even offline. */
export function resolveCommunitySettings(settings: CommunitySettings, now = Date.now()): CommunitySettings {
  const expired = settings.status === "expired" || (settings.status === "active" && !!settings.expiresAt && Date.parse(settings.expiresAt) <= now);
  if (!expired) return settings;
  return settings.supportQrCodeUrl
    ? { ...settings, status: "support", qrCodeUrl: settings.supportQrCodeUrl, expiresAt: "" }
    : { ...settings, status: "expired", qrCodeUrl: "" };
}

// Only expose public QR settings, never private settings or expired group images.
export function getCommunitySettings(settings: Record<string, string>, now = Date.now()): CommunitySettings {
  const image = wechatGroupQrUrlSchema.safeParse(settings.wechatGroupQrUrl || "");
  const expiry = wechatGroupExpiresAtSchema.safeParse(settings.wechatGroupExpiresAt || "");
  const support = qrImageUrlSchema.safeParse(settings.wechatSupportQrUrl || "");
  const supportQrCodeUrl = support.success ? support.data : "";
  if (!image.success || !image.data || !expiry.success) {
    return { status: "unconfigured", qrCodeUrl: "", expiresAt: "", supportQrCodeUrl };
  }
  return resolveCommunitySettings({ status: "active", qrCodeUrl: image.data, expiresAt: expiry.data, supportQrCodeUrl }, now);
}

export function getCommunityEntryUrl(siteUrl: string): string {
  const url = new URL(siteUrl);
  if (!["https:", "http:"].includes(url.protocol) || url.username || url.password) {
    throw new Error("站点地址需要使用 HTTP 或 HTTPS");
  }
  return new URL("/community", url).href;
}
