"use client";

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { MessageCircle, RefreshCw } from "lucide-react";
import type { CommunitySettings } from "@/lib/community-settings";

function GroupCode({ settings }: { settings: CommunitySettings }) {
  const [imageFailed, setImageFailed] = useState(false);
  if (imageFailed) {
    return <p role="alert" className="rounded-xl bg-amber-50 px-5 py-8 text-sm text-amber-700">二维码图片暂时无法加载，请稍后刷新重试。</p>;
  }
  return (
    <>
      <div className="mx-auto mt-6 max-w-sm overflow-hidden rounded-2xl border border-gray-100 bg-white p-3">
        <img src={settings.qrCodeUrl} alt="最新微信群入群二维码" className="mx-auto h-auto max-h-[440px] w-full object-contain" onError={() => setImageFailed(true)} referrerPolicy="no-referrer" />
      </div>
      <p className="mt-5 text-sm font-medium text-gray-700">用微信扫一扫，或在微信内长按识别二维码</p>
      {settings.expiresAt && <p className="mt-2 text-xs text-gray-500">有效期至 {new Date(settings.expiresAt).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" })}（北京时间）</p>}
    </>
  );
}

export function CommunityPanel({ initialSettings }: { initialSettings: CommunitySettings }) {
  const [now, setNow] = useState(Date.now());
  const [imageRetry, setImageRetry] = useState(0);
  const { data = initialSettings, isError, isFetching, refetch } = useQuery({
    queryKey: ["wechat-community"],
    initialData: initialSettings,
    queryFn: async () => {
      const response = await fetch("/api/community", { cache: "no-store" });
      if (!response.ok) throw new Error("无法获取群二维码");
      return response.json() as Promise<CommunitySettings>;
    },
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
    staleTime: 0,
  });
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const checkExpiry = () => {
      const currentTime = Date.now();
      setNow(currentTime);
      const remaining = Date.parse(data.expiresAt) - currentTime;
      if (remaining > 0) timer = setTimeout(checkExpiry, Math.min(remaining + 1, 2_147_000_000));
    };
    checkExpiry();
    return () => clearTimeout(timer);
  }, [data.expiresAt]);
  // Hide expired images even when a refresh request fails.
  const expired = data.expiresAt && Date.parse(data.expiresAt) <= now;
  const showCode = data.status === "active" && !expired && !isError;

  return (
    <section className="mx-auto w-full max-w-lg rounded-3xl border border-gray-100 bg-white p-6 text-center shadow-sm sm:p-10" aria-labelledby="wechat-community-title">
      <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600"><MessageCircle size={28} aria-hidden="true" /></div>
      <h1 id="wechat-community-title" className="text-2xl font-bold text-gray-900">微信交流群</h1>
      <p className="mt-3 text-sm leading-6 text-gray-600">欢迎交流 AI Shop 项目部署、使用经验和功能建议。</p>
      {showCode ? <GroupCode key={`${data.qrCodeUrl}:${imageRetry}`} settings={data} /> : (
        <div role="status" className="mt-6 rounded-2xl bg-gray-50 px-5 py-10">
          <p className="font-medium text-gray-700">{isError ? "群二维码暂时无法加载" : data.status === "expired" || expired ? "群二维码正在更新" : "交流群暂未开放"}</p>
          <p className="mt-2 text-sm leading-6 text-gray-500">{isError ? "请检查网络，或稍后刷新重试。" : "请稍后再来，更新后可在此查看最新二维码。"}</p>
        </div>
      )}
      <button type="button" onClick={() => { setImageRetry((current) => current + 1); void refetch(); }} disabled={isFetching} className="mt-6 inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-gray-500 hover:bg-gray-50 hover:text-gray-800 disabled:opacity-50">
        <RefreshCw size={15} className={isFetching ? "animate-spin" : ""} aria-hidden="true" />{isFetching ? "正在刷新" : "刷新二维码"}
      </button>
    </section>
  );
}
