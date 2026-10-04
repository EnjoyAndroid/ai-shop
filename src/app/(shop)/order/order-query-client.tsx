"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { HeaderClient } from "@/components/shop/header-client";
import { ContactSupport } from "@/components/shop/contact-support";
import { OrderDialog } from "@/components/shop/order-dialog";
import SliderCaptcha from "@/components/slider-captcha";
import { orderKeywordSchema } from "@/lib/order-rules";
import { orderResultsUrl } from "@/lib/order-client";
import { ORDER_EMAIL_HISTORY_KEY, readOrderEmailHistory, rememberOrderEmail, removeOrderEmail } from "@/lib/order-email-history";

function OrderQueryContent() {
  const router = useRouter();
  const params = useSearchParams();
  const initialOrderNo = params.get("orderNo") || "";
  const expired = params.get("expired") === "1";
  const [keyword, setKeyword] = useState(initialOrderNo);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [captchaKeyword, setCaptchaKeyword] = useState<string | null>(null);
  const [emailHistory, setEmailHistory] = useState<string[]>([]);
  const keywordRef = useRef<HTMLInputElement>(null);
  const requestRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const refresh = () => setEmailHistory(readOrderEmailHistory());
    const onStorage = (event: StorageEvent) => {
      if (event.key === ORDER_EMAIL_HISTORY_KEY || event.key === null) refresh();
    };
    refresh();
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  useEffect(() => {
    setKeyword(initialOrderNo);
    setError(expired ? "查询验证已过期，请重新查询" : "");
    // The entry page never restores previous results or queries automatically.
    try { sessionStorage.removeItem("order-search"); } catch { /* Storage is optional. */ }
    return () => requestRef.current?.abort();
  }, [initialOrderNo, expired]);

  const beginSearch = (event: React.FormEvent) => {
    event.preventDefault();
    const parsed = orderKeywordSchema.safeParse(keyword);
    if (!parsed.success) { setError(parsed.error.issues[0].message); return; }
    setKeyword(parsed.data);
    setError("");
    setCaptchaKeyword(parsed.data);
  };
  const closeCaptcha = () => { requestRef.current?.abort(); setCaptchaKeyword(null); setLoading(false); };
  const search = async (captchaToken: string) => {
    if (captchaKeyword === null) return;
    requestRef.current?.abort();
    const controller = new AbortController();
    requestRef.current = controller;
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/orders/search", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ keyword: captchaKeyword, captchaToken }), signal: controller.signal,
      });
      const data = await response.json();
      if (controller.signal.aborted) return;
      if (!response.ok) throw new Error(data.error || "查询失败，请重试");
      setEmailHistory(rememberOrderEmail(captchaKeyword));
      router.push(orderResultsUrl(data.queryToken));
      setCaptchaKeyword(null);
    } catch (err) {
      if (!controller.signal.aborted) { setError(err instanceof Error ? err.message : "查询失败，请重试"); setCaptchaKeyword(null); }
    } finally { if (!controller.signal.aborted) setLoading(false); }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <HeaderClient />
      <main className="container mx-auto px-4 py-8 sm:py-12">
        <div className="mx-auto max-w-3xl">
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-800 text-center mb-3">订单查询</h1>
          <p className="text-sm text-gray-500 text-center mb-8">通过下单邮箱或订单号查找订单，输入查询密码即可查看详情和卡密。</p>
          <form onSubmit={beginSearch} className="bg-white rounded-xl p-5 sm:p-6">
            <label htmlFor="order-keyword" className="block text-sm font-medium text-gray-700 mb-2">下单邮箱 / 订单号</label>
            <div className="flex flex-col sm:flex-row gap-3">
              <input ref={keywordRef} id="order-keyword" value={keyword} maxLength={254} autoComplete="off" required
                onChange={event => { setKeyword(event.target.value); setError(""); }}
                placeholder="请输入下单邮箱或订单号" className="min-w-0 flex-1 border rounded-lg px-4 py-3 focus:outline-none focus:ring-2 focus:ring-primary/50" />
              <button type="submit" disabled={loading} className="rounded-lg px-6 py-3 bg-primary text-white font-medium hover:bg-primary/90 disabled:opacity-50">{loading ? "查询中…" : "查询订单"}</button>
            </div>
            {emailHistory.length > 0 && <div aria-label="邮箱查询历史" className="mt-4 flex flex-wrap items-center gap-2 text-xs">
              <span className="text-gray-400 mr-1">浏览器缓存</span>
              {emailHistory.map(email => <div key={email} className="flex min-w-0 max-w-full items-center rounded-lg border border-slate-200 bg-slate-50">
                <button type="button" disabled={loading} title={email} aria-label={`填入邮箱 ${email}`}
                  onClick={() => { setKeyword(email); setError(""); keywordRef.current?.focus(); }}
                  className="min-w-0 truncate rounded-l-lg px-3 py-2 text-slate-600 transition-colors hover:bg-blue-50 hover:text-primary disabled:opacity-50">{email}</button>
                <button type="button" aria-label={`删除缓存邮箱 ${email}`} title="删除此邮箱" disabled={loading}
                  onClick={() => setEmailHistory(removeOrderEmail(email))}
                  className="shrink-0 rounded-r-lg px-2 py-2 text-slate-400 transition-colors hover:bg-slate-200 hover:text-slate-700 disabled:opacity-50">✕</button>
              </div>)}
            </div>}
            {error && <p role="alert" className="mt-3 text-sm text-red-600">{error}</p>}
          </form>
          <div className="mt-8"><ContactSupport /></div>
        </div>
      </main>
      {captchaKeyword !== null && <OrderDialog title="安全验证" description="完成拼图，即可查看订单" onClose={closeCaptcha}>
        <div className="px-6 pt-5 pb-6 flex flex-col items-center gap-3">
          <SliderCaptcha onSuccess={token => void search(token)} />
          {loading && <p role="status" className="text-sm text-primary">正在查询订单…</p>}
        </div>
      </OrderDialog>}
    </div>
  );
}

export function OrderQueryClient() {
  return <Suspense fallback={<div className="p-12 text-center text-gray-500">正在加载订单查询…</div>}><OrderQueryContent /></Suspense>;
}
