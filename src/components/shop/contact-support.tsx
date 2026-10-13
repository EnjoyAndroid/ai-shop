"use client";
import { CONTACT_EMAIL } from "@/lib/public-config";
import { useContactSettings } from "./use-contact-settings";
import { WechatSupport } from "./wechat-support";
export function ContactSupport({ prefix = "如有问题，请" }: { prefix?: string }) {
  const { telegramUrl, wechatSupportText, wechatSupportQrUrl } = useContactSettings();
  const url = telegramUrl || (CONTACT_EMAIL ? `mailto:${CONTACT_EMAIL}` : "");
  if (!url && !wechatSupportText && !wechatSupportQrUrl) return null;
  return <div className="text-center text-sm text-gray-500">{prefix}{wechatSupportText || wechatSupportQrUrl ? <WechatSupport text={wechatSupportText} qrUrl={wechatSupportQrUrl} label="联系客服" className="text-primary hover:underline" /> : <a href={url} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">联系客服</a>}</div>;
}
