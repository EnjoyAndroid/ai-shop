"use client";

import { useState } from "react";
import { qrImageUrlSchema } from "@/lib/qr-settings";

export function ContactQrInput({ id, label, value, purpose, disabled, onChange, onBusyChange }: {
  id: string; label: string; value: string; purpose: "support" | "community"; disabled: boolean;
  onChange: (value: string) => void; onBusyChange: (busy: boolean) => void;
}) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const preview = qrImageUrlSchema.safeParse(value);

  async function upload(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setError("");
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > 2 * 1024 * 1024) {
      setError("请选择不超过2MB的 PNG、JPG 或 WebP 图片"); return;
    }
    setUploading(true); onBusyChange(true);
    try {
      const form = new FormData(); form.append("file", file); form.append("purpose", purpose);
      const response = await fetch("/api/upload", { method: "POST", body: form });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "上传失败");
      const image = qrImageUrlSchema.safeParse(data.url);
      if (!image.success || !image.data) throw new Error("上传结果无效，请重试");
      onChange(image.data);
    } catch (err) { setError(err instanceof Error ? err.message : "上传失败，请重试"); }
    finally { setUploading(false); onBusyChange(false); }
  }

  return <div className="space-y-3">
    <div><label htmlFor={`${id}-upload`} className="mb-2 block text-sm text-gray-600">上传{label}</label>
      <input id={`${id}-upload`} type="file" accept="image/png,image/jpeg,image/webp" onChange={upload} disabled={disabled || uploading} className="block w-full text-sm text-gray-500 file:mr-4 file:rounded-lg file:border-0 file:bg-blue-50 file:px-4 file:py-2 file:text-blue-700 disabled:opacity-50" />
      <p className="mt-2 text-xs text-gray-500">PNG、JPG、WebP，最大2MB；上传完成后保存设置。</p>
    </div>
    <div><label htmlFor={id} className="mb-1 block text-sm text-gray-600">{label}图片地址</label>
      <input id={id} type="url" value={value} onChange={event => { onChange(event.target.value); setError(""); }} disabled={disabled || uploading} maxLength={2048} placeholder="上传后自动填写，也可粘贴 HTTPS 图片地址" className="w-full rounded-lg border px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50" />
    </div>
    {uploading && <p role="status" className="text-sm text-gray-500">正在上传...</p>}
    {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
    {preview.success && preview.data && <div className="flex items-start gap-4 rounded-lg border border-gray-100 p-3">
      <img src={preview.data} alt={`${label}预览`} referrerPolicy="no-referrer" className="max-h-48 w-36 object-contain" />
      <button type="button" disabled={disabled || uploading} onClick={() => { onChange(""); setError(""); }} className="text-sm text-red-600 disabled:opacity-50">移除二维码</button>
    </div>}
  </div>;
}
