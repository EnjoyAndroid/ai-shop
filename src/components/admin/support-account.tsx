'use client';
import { useEffect, useRef, useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';

export function SupportAccount({turnId,account,canReveal,disabled}:{turnId:string;account:string;canReveal:boolean;disabled:boolean}) {
  const [plain,setPlain] = useState<string|null>(null);
  const [loading,setLoading] = useState(false);
  const [error,setError] = useState(false);
  const pending = useRef<AbortController|null>(null);
  useEffect(()=>()=>pending.current?.abort(),[]);
  async function toggle() {
    if (plain) { setPlain(null); return; }
    const controller = new AbortController();
    pending.current = controller;
    setLoading(true); setError(false);
    try {
      const response = await fetch('/api/admin/support/account/reveal',{method:'POST',cache:'no-store',signal:controller.signal,
        headers:{'Content-Type':'application/json'},body:JSON.stringify({turnId})});
      if (!response.ok) throw new Error('reveal failed');
      const result = await response.json();
      if (!controller.signal.aborted && typeof result.account === 'string') setPlain(result.account);
    } catch { if (!controller.signal.aborted) setError(true); }
    finally { if (!controller.signal.aborted) setLoading(false); }
  }
  const label = plain ? '隐藏完整账号' : '查看完整账号（记录操作）';
  return <span className="inline-flex items-center gap-1 break-all">
    <span>{plain || account}</span>
    {canReveal&&<button type="button" aria-label={label} title={label} aria-pressed={Boolean(plain)} disabled={disabled||loading}
      onClick={event=>{event.preventDefault();event.stopPropagation();void toggle();}}
      className="inline-flex shrink-0 items-center justify-center rounded p-1 text-gray-400 hover:text-gray-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500 disabled:opacity-40">
      {plain ? <EyeOff size={16} aria-hidden="true"/> : <Eye size={16} aria-hidden="true"/>}
    </button>}
    {loading&&<span role="status">加载中…</span>}
    {error&&<span role="alert" className="text-red-600">查看失败，请重试</span>}
  </span>;
}
