"use client";

import Link from 'next/link';
import React, { useState } from 'react';
import { readSupportUi, type SupportUiImage } from '@/lib/support/ui';
import { WechatSupport } from './wechat-support';

function SupportImage({ image }: { image: SupportUiImage }) {
  const [failed, setFailed] = useState(false);
  return <figure className="mt-3 rounded-xl border border-slate-100 bg-white p-3">
    {failed ? <p role="alert" className="text-sm text-amber-700">二维码暂时无法加载，请点击下方按钮重试。</p> : <img src={image.url} alt={image.alt} referrerPolicy="no-referrer" onError={() => setFailed(true)} className="mx-auto h-48 w-48 max-w-full object-contain" />}
    <figcaption className="mt-2 text-center text-xs text-slate-500">用微信扫一扫，或长按识别二维码</figcaption>
    <WechatSupport text="" qrUrl={image.url} label="放大查看二维码" className="mt-2 w-full text-center text-sm text-blue-600 hover:underline" />
  </figure>;
}

export function SupportMessageUi({ value, onNavigate }: { value: unknown; onNavigate?: () => void }) {
  const ui = readSupportUi(value);
  return <>
    {ui.images.map(image => <SupportImage key={image.url} image={image} />)}
    {ui.links.length > 0 && <nav aria-label="客服推荐页面" className="mt-3 flex flex-wrap gap-2">
      {ui.links.map(link => <Link key={link.href} href={link.href} onClick={onNavigate} className="rounded-lg border border-blue-200 px-3 py-2 text-xs text-blue-600 hover:bg-blue-50">{link.label}</Link>)}
    </nav>}
  </>;
}

const messageDateFormat = new Intl.DateTimeFormat("en", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit" });
function messageDateParts(date: Date) {
  return Object.fromEntries(messageDateFormat.formatToParts(date).map(part => [part.type, part.value]));
}

/** Keep full timestamps accessible while shortening the visible date. */
export function SupportMessageTime({ value, now = new Date(), className = "" }: { value?: string; now?: Date; className?: string }) {
  if (!value || !Number.isFinite(Date.parse(value))) return null;
  const date = new Date(value);
  const parts = messageDateParts(date);
  const today = messageDateParts(now);
  const time = date.toLocaleTimeString("zh-CN", { timeZone: "Asia/Shanghai", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
  const fullDate = `${parts.year}-${parts.month}-${parts.day}`;
  const sameYear = parts.year === today.year;
  const sameDay = sameYear && parts.month === today.month && parts.day === today.day;
  const label = sameDay ? time : `${sameYear ? `${parts.month}-${parts.day}` : fullDate} ${time}`;
  const fullLabel = `${fullDate} ${time}（北京时间）`;
  return <time dateTime={date.toISOString()} title={fullLabel} aria-label={fullLabel} className={`block whitespace-nowrap text-[10px] font-normal leading-4 text-slate-400 ${className}`}>{label}</time>;
}
