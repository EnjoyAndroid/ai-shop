"use client";
import { useState } from "react";
import { CONTACT_EMAIL } from "@/lib/public-config";
import { useContactSettings } from "./use-contact-settings";

export function ContactButtons() {
  const { telegramUrl } = useContactSettings();
  return <div className="flex justify-center gap-4">
    {CONTACT_EMAIL && <a href={`mailto:${CONTACT_EMAIL}`} className="px-6 py-3 bg-primary text-white rounded-lg">📧 发送邮件</a>}
    {telegramUrl && <a href={telegramUrl} target="_blank" rel="noopener noreferrer" className="px-6 py-3 bg-blue-500 text-white rounded-lg">💬 Telegram</a>}
  </div>;
}

export function CopyEmailLink({ className = "" }: { className?: string }) {
  const [copied, setCopied] = useState(false);
  if (!CONTACT_EMAIL) return null;
  return <>
    <button className={className} onClick={async () => {
      try { await navigator.clipboard.writeText(CONTACT_EMAIL); setCopied(true); setTimeout(() => setCopied(false), 2000); }
      catch { window.location.href = `mailto:${CONTACT_EMAIL}`; }
    }}>{CONTACT_EMAIL}</button>
    {copied && <div role="status" className="fixed top-20 left-1/2 -translate-x-1/2 px-6 py-3 bg-primary text-white rounded-lg shadow-lg z-50">已复制邮箱地址</div>}
  </>;
}
