"use client";

import { useEffect, useState } from "react";
import { AdminContentLoading } from "@/components/admin/content-loading";
import Link from "next/link";
import { ContactQrInput } from "./contact-qr-input";
import { EMPTY_CONTACT_SETTINGS, contactSettingsSchema, type AdminContactSettings } from "@/lib/contact-settings";
import { getCommunityEntryUrl } from "@/lib/community-settings";

function toLocalDateTime(value: string) {
  if (!value || !Number.isFinite(Date.parse(value))) return "";
  const date = new Date(value);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

export function ContactSettingsForm() {
  const [settings, setSettings] = useState<AdminContactSettings>(EMPTY_CONTACT_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [revision, setRevision] = useState(0);
  const [saving, setSaving] = useState(false);
  const [uploads, setUploads] = useState({ support: false, community: false });
  const [message, setMessage] = useState<{ success: boolean; text: string } | null>(null);
  const [entryUrl, setEntryUrl] = useState("/community");
  const busy = saving || uploads.support || uploads.community;

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setLoadError("");
    setEntryUrl(getCommunityEntryUrl(window.location.origin));
    void fetch("/api/admin/contact", { cache: "no-store", signal: controller.signal }).then(async response => {
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "获取设置失败");
      if (!controller.signal.aborted) setSettings({ ...EMPTY_CONTACT_SETTINGS, ...data.settings });
    }).catch(error => { if (!controller.signal.aborted) setLoadError(error instanceof Error ? error.message : "获取设置失败"); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [revision]);

  function change(key: keyof AdminContactSettings, value: string) {
    setSettings(current => ({ ...current, [key]: value })); setMessage(null);
  }
  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (busy || loading || loadError) return;
    setMessage(null);
    const validation = contactSettingsSchema.safeParse(settings);
    if (!validation.success) { setMessage({ success: false, text: validation.error.issues[0].message }); return; }
    setSaving(true);
    try {
      const response = await fetch("/api/admin/contact", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(validation.data) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "保存失败");
      setSettings(validation.data); setMessage({ success: true, text: "客服与社群设置已保存，刷新商城即可生效" });
    } catch (error) { setMessage({ success: false, text: error instanceof Error ? error.message : "保存失败" }); }
    finally { setSaving(false); }
  }

  return <>
    <h1 className="text-2xl font-bold text-gray-800">客服与社群</h1>
    <p className="mb-8 mt-2 text-sm text-gray-500">统一维护客服联系信息和微信群入口，留空的联系方式会自动隐藏。</p>
    {loading ? <AdminContentLoading /> : loadError ? <div role="alert" className="rounded-xl bg-white p-6"><p className="text-red-600">{loadError}</p><button type="button" onClick={() => setRevision(current => current + 1)} className="mt-3 text-primary">重新加载</button></div> : <form onSubmit={save} className="max-w-4xl space-y-6">
      {message && <p role={message.success ? "status" : "alert"} className={`rounded-lg p-4 text-sm ${message.success ? "bg-green-50 text-green-700" : "bg-red-50 text-red-600"}`}>{message.text}</p>}
      <section className="rounded-xl bg-white p-6 shadow-sm" aria-labelledby="wechat-support-settings">
        <h2 id="wechat-support-settings" className="mb-2 text-lg font-bold text-gray-800">微信客服</h2>
        <label htmlFor="wechatSupportText" className="mb-2 block text-sm text-gray-600">微信号或联系说明</label>
        <textarea id="wechatSupportText" rows={3} value={settings.wechatSupportText} disabled={busy} onChange={event => change("wechatSupportText", event.target.value)} maxLength={300} placeholder="填写微信号、服务时间或联系说明" className="mb-5 w-full rounded-lg border px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
        <ContactQrInput id="wechatSupportQrUrl" label="微信客服二维码" value={settings.wechatSupportQrUrl} purpose="support" disabled={saving} onChange={value => change("wechatSupportQrUrl", value)} onBusyChange={value => setUploads(current => ({ ...current, support: value }))} />
      </section>
      <section className="rounded-xl bg-white p-6 shadow-sm" aria-labelledby="telegram-support-settings">
        <h2 id="telegram-support-settings" className="mb-4 text-lg font-bold text-gray-800">Telegram 客服</h2>
        <label htmlFor="telegramUrl" className="mb-1 block text-sm text-gray-600">客服用户名或链接</label>
        <input id="telegramUrl" value={settings.telegramUrl} disabled={busy} onChange={event => change("telegramUrl", event.target.value)} maxLength={100} placeholder="@用户名 或 https://t.me/用户名" className="w-full rounded-lg border px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
        <p className="mt-2 text-xs text-gray-500">留空隐藏 Telegram 入口，保存后刷新商城即可生效。</p>
      </section>
      <section className="rounded-xl bg-white p-6 shadow-sm" aria-labelledby="wechat-group-settings">
        <h2 id="wechat-group-settings" className="mb-2 text-lg font-bold text-gray-800">微信交流群</h2>
        <p className="mb-5 text-sm text-gray-500">首页和 README 使用固定入口，更换群码后保存即可生效。</p>
        <ContactQrInput id="wechatGroupQrUrl" label="微信群二维码" value={settings.wechatGroupQrUrl} purpose="community" disabled={saving} onChange={value => { setSettings(current => ({ ...current, wechatGroupQrUrl: value, wechatGroupExpiresAt: "" })); setMessage(null); }} onBusyChange={value => setUploads(current => ({ ...current, community: value }))} />
        <label htmlFor="wechatGroupExpiresAt" className="mb-1 mt-5 block text-sm text-gray-600">过期时间（可选，使用当前设备时区）</label>
        <input id="wechatGroupExpiresAt" type="datetime-local" disabled={busy} value={toLocalDateTime(settings.wechatGroupExpiresAt)} onChange={event => { const date = new Date(event.target.value); change("wechatGroupExpiresAt", event.target.value && Number.isFinite(date.getTime()) ? date.toISOString() : ""); }} className="w-full rounded-lg border px-4 py-2 text-sm" />
        <p className="mt-2 text-xs text-gray-500">到期后隐藏旧群码。固定入口不会自动延长微信邀请有效期，群满或邀请受限时也需更新。</p>
        <div className="mt-4 rounded-lg bg-gray-50 p-4"><p className="text-sm font-medium text-gray-700">固定入群页面</p><Link href="/community" target="_blank" rel="noopener noreferrer" className="mt-1 block break-all text-sm text-primary hover:underline">{entryUrl}</Link><a href="/api/community/entry-qr" download="ai-shop-wechat-entry.png" className="mt-3 inline-block text-sm text-primary hover:underline">下载固定入口二维码</a></div>
      </section>
      <button type="submit" disabled={busy} className="w-full rounded-lg bg-primary px-4 py-3 font-semibold text-white hover:bg-primary/90 disabled:opacity-50">{saving ? "保存中..." : uploads.support || uploads.community ? "二维码上传中..." : "保存设置"}</button>
    </form>}
  </>;
}
