"use client";

import { useEffect, useRef, useState } from "react";
import { X, MessageCircle } from "lucide-react";

export function WechatSupport({ text, qrUrl, label = "微信客服", className = "" }: { text: string; qrUrl: string; label?: string; className?: string }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [imageFailed, setImageFailed] = useState(false);
  useEffect(() => { setImageFailed(false); }, [qrUrl]);
  useEffect(() => { if (!text && !qrUrl) dialogRef.current?.close(); }, [text, qrUrl]);
  if (!text && !qrUrl) return null;

  return <>
    <button ref={triggerRef} type="button" onClick={() => { setImageFailed(false); dialogRef.current?.showModal(); }} className={className}>{label}</button>
    <dialog ref={dialogRef} aria-label="微信客服" onClose={() => triggerRef.current?.focus()} className="w-[calc(100%_-_2rem)] max-w-sm rounded-2xl p-6 text-left text-gray-800 shadow-xl backdrop:bg-black/40">
      <div className="mb-5 flex items-center justify-between"><h2 className="inline-flex items-center gap-2 text-lg font-semibold"><MessageCircle size={20} className="text-emerald-600" aria-hidden="true" />微信客服</h2><button type="button" aria-label="关闭微信客服" onClick={() => dialogRef.current?.close()} className="rounded-lg p-1 text-gray-400 hover:bg-gray-100"><X size={20} /></button></div>
      {qrUrl && (imageFailed ? <p role="alert" className="mb-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-700">二维码暂时无法加载，请稍后重试。</p> : <><img src={qrUrl} alt="微信客服二维码" referrerPolicy="no-referrer" onError={() => setImageFailed(true)} className="mx-auto max-h-80 w-full max-w-64 rounded-lg object-contain" /><p className="mt-3 text-center text-xs text-gray-500">用微信扫一扫，或长按识别二维码</p></>)}
      {!qrUrl && <p role="status" className="rounded-lg bg-gray-50 p-4 text-center text-sm text-gray-500">客服二维码暂未配置，请稍后再试。</p>}
    </dialog>
  </>;
}
