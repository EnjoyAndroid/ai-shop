"use client";
import { useContactSettings } from "./use-contact-settings";
import { WechatSupport } from "./wechat-support";

export function ContactButtons() {
  const { telegramUrl, wechatSupportText, wechatSupportQrUrl } = useContactSettings();
  return <div className="flex flex-wrap justify-center gap-4">
    <WechatSupport text={wechatSupportText} qrUrl={wechatSupportQrUrl} className="rounded-lg bg-emerald-600 px-6 py-3 text-white hover:bg-emerald-700" />
    {telegramUrl && <a href={telegramUrl} target="_blank" rel="noopener noreferrer" className="px-6 py-3 bg-blue-500 text-white rounded-lg">💬 Telegram</a>}
  </div>;
}
