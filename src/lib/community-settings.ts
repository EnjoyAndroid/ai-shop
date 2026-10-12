import { z } from "zod";

export const wechatGroupQrUrlSchema = z.string().trim().max(2048).refine((value) => {
  if (!value) return true;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password;
  } catch { return false; }
}, "请上传二维码或填写有效的 HTTPS 图片地址");

export const wechatGroupExpiresAtSchema = z.union([
  z.literal(""),
  z.string().datetime({ offset: true, message: "二维码过期时间无效" }),
]);

export interface CommunitySettings {
  status: "active" | "expired" | "unconfigured";
  qrCodeUrl: string;
  expiresAt: string;
}

// Only expose a current QR image, never private system settings or expired codes.
export function getCommunitySettings(settings: Record<string, string>, now = Date.now()): CommunitySettings {
  const image = wechatGroupQrUrlSchema.safeParse(settings.wechatGroupQrUrl || "");
  const expiry = wechatGroupExpiresAtSchema.safeParse(settings.wechatGroupExpiresAt || "");
  if (!image.success || !image.data || !expiry.success) {
    return { status: "unconfigured", qrCodeUrl: "", expiresAt: "" };
  }
  if (expiry.data && Date.parse(expiry.data) <= now) {
    return { status: "expired", qrCodeUrl: "", expiresAt: expiry.data };
  }
  return { status: "active", qrCodeUrl: image.data, expiresAt: expiry.data };
}

export function getCommunityEntryUrl(siteUrl: string): string {
  const url = new URL(siteUrl);
  if (!["https:", "http:"].includes(url.protocol) || url.username || url.password) {
    throw new Error("站点地址需要使用 HTTP 或 HTTPS");
  }
  return new URL("/community", url).href;
}
