"use client";

import { useState, useEffect, Suspense } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { useRouter } from "next/navigation";
import Link from "next/link";

function PayContent() {
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();

  const orderNo = params.orderNo as string;
  const password = searchParams.get("password") || "";
  const qrCode = searchParams.get("qrcode") || "";
  const amount = searchParams.get("amount") || "0";
  const method = searchParams.get("method") || "WECHAT";

  const [countdown, setCountdown] = useState(5 * 60); // 5分钟

  // 倒计时
  useEffect(() => {
    if (countdown <= 0) return;

    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  // 轮询检查支付状态
  useEffect(() => {
    const checkPayment = async () => {
      try {
        const res = await fetch(`/api/orders?orderNo=${orderNo}&password=${password}`);
        const data = await res.json();

        if (data.order?.status === "DELIVERED" || data.order?.status === "PAID") {
          router.push(`/order/${orderNo}?password=${password}`);
        }
      } catch (e) {
        console.error("Check payment error:", e);
      }
    };

    // 每3秒检查一次
    const interval = setInterval(checkPayment, 3000);

    return () => clearInterval(interval);
  }, [orderNo, password, router]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  const isWechat = method === "WECHAT";
  const methodLabel = isWechat ? "微信" : method === "ALIPAY" ? "支付宝" : method;
  const themeColor = isWechat ? "#07C160" : "#1677FF";

  if (countdown <= 0) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <div className="bg-white rounded-lg p-8 shadow-sm text-center max-w-md">
          <div className="text-6xl mb-4">⏰</div>
          <h2 className="text-xl font-bold text-gray-800 mb-2">支付超时</h2>
          <p className="text-gray-500 mb-6">订单已超时，请重新下单</p>
          <Link
            href="/"
            className="inline-block px-6 py-3 bg-primary text-white rounded-lg hover:bg-primary/90"
          >
            返回首页
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100">
      {/* 顶部标题栏 */}
      <div className="bg-white border-b">
        <div className="container mx-auto px-4">
          <h1 className="text-center text-xl font-bold py-4 text-gray-800">
            {methodLabel}支付收银台
          </h1>
        </div>
      </div>

      {/* 主内容 */}
      <div className="container mx-auto px-4 py-8">
        <div className="max-w-4xl mx-auto">
          <div className="bg-white rounded-lg shadow-sm overflow-hidden">
            <div className="grid grid-cols-1 lg:grid-cols-2">
              {/* 左侧：二维码区域 */}
              <div className="p-8 flex flex-col items-center">
                {/* 支付方式标识 */}
                <div className="flex items-center gap-2 mb-4">
                  {isWechat ? (
                    <svg viewBox="0 0 24 24" className="w-8 h-8" fill="#07C160">
                      <path d="M8.691 2.188C3.891 2.188 0 5.476 0 9.53c0 2.212 1.17 4.203 3.002 5.55a.59.59 0 01.213.665l-.39 1.48c-.019.07-.048.141-.048.213 0 .163.13.295.29.295a.326.326 0 00.167-.054l1.903-1.114a.864.864 0 01.717-.098 10.16 10.16 0 002.837.403c.276 0 .543-.027.811-.05-.857-2.578.157-4.972 1.932-6.446 1.703-1.415 3.882-1.98 5.853-1.838-.576-3.583-4.196-6.348-8.596-6.348zM5.785 5.991c.642 0 1.162.529 1.162 1.18a1.17 1.17 0 01-1.162 1.178A1.17 1.17 0 014.623 7.17c0-.651.52-1.18 1.162-1.18zm5.813 0c.642 0 1.162.529 1.162 1.18a1.17 1.17 0 01-1.162 1.178 1.17 1.17 0 01-1.162-1.178c0-.651.52-1.18 1.162-1.18zm5.34 2.867c-1.797-.052-3.746.512-5.28 1.786-1.72 1.428-2.687 3.72-1.78 6.22.942 2.453 3.666 4.229 6.884 4.229.826 0 1.622-.12 2.361-.336a.722.722 0 01.598.082l1.584.926a.272.272 0 00.14.045c.134 0 .24-.111.24-.247 0-.06-.023-.12-.038-.177l-.327-1.233a.582.582 0 01-.023-.156.49.49 0 01.201-.398C23.024 18.48 24 16.82 24 14.98c0-3.21-2.931-5.837-6.656-6.088V8.89c-.135-.01-.269-.03-.406-.03zm-2.53 3.274c.535 0 .969.44.969.982a.976.976 0 01-.969.983.976.976 0 01-.969-.983c0-.542.434-.982.97-.982zm4.844 0c.535 0 .969.44.969.982a.976.976 0 01-.969.983.976.976 0 01-.969-.983c0-.542.434-.982.969-.982z"/>
                    </svg>
                  ) : (
                    <svg viewBox="0 0 24 24" className="w-8 h-8" fill="#1677FF">
                      <path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm4.836 15.168c-.18.414-.54.678-.96.678H8.124c-.42 0-.78-.264-.96-.678L4.8 9.6h14.4l-2.364 5.568zM8.4 8.4V6h7.2v2.4H8.4z"/>
                    </svg>
                  )}
                  <span className="text-lg font-medium" style={{ color: themeColor }}>
                    {methodLabel}支付
                  </span>
                </div>

                {/* 订单信息 */}
                <p className="text-gray-600 text-sm mb-2">
                  AI Shop 订单 {orderNo}
                </p>

                {/* 金额 */}
                <p className="text-2xl font-bold mb-4" style={{ color: themeColor }}>
                  ¥ {(parseInt(amount) / 100).toFixed(2)}
                </p>

                {/* 二维码 */}
                {qrCode && (
                  <div className="relative mb-4">
                    <div className="p-3 border-2 border-gray-200 rounded-lg bg-white">
                      <img
                        src={qrCode}
                        alt="支付二维码"
                        className="w-52 h-52"
                      />
                      {/* 中心图标 */}
                      <div
                        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-10 h-10 rounded-full flex items-center justify-center"
                        style={{ backgroundColor: themeColor }}
                      >
                        <svg viewBox="0 0 24 24" className="w-6 h-6" fill="white">
                          <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/>
                        </svg>
                      </div>
                    </div>
                  </div>
                )}

                {/* 倒计时提示 */}
                <div className="text-center mb-4">
                  <p className="text-red-500 text-sm font-medium">
                    请在 <span className="text-lg font-bold">{formatTime(countdown)}</span> 内完成支付
                  </p>
                </div>

                {/* 扫码提示 */}
                <div className="text-center text-red-500 text-sm">
                  <p>请使用{methodLabel}扫描上方二维码完成支付</p>
                  <p className="mt-1">支付成功后页面将自动跳转</p>
                </div>

                {/* 检测状态 */}
                <div className="mt-4 flex items-center gap-2 text-gray-500 text-sm">
                  <div className="w-4 h-4 border-2 border-gray-400 border-t-transparent rounded-full animate-spin"></div>
                  正在检测支付结果...
                </div>
              </div>

              {/* 右侧：手机示意图 */}
              <div className="hidden lg:flex items-center justify-center bg-gray-50 p-8">
                <div className="relative">
                  {/* 手机外框 */}
                  <div className="w-64 h-[500px] bg-white rounded-[3rem] border-8 border-gray-800 shadow-xl overflow-hidden">
                    {/* 手机顶部 */}
                    <div className="h-6 bg-gray-800 flex items-center justify-center">
                      <div className="w-20 h-4 bg-gray-900 rounded-full"></div>
                    </div>
                    {/* 手机屏幕 */}
                    <div className="h-full bg-gradient-to-b from-gray-100 to-gray-200 p-4">
                      {/* 状态栏 */}
                      <div className="flex justify-between text-xs text-gray-600 mb-4">
                        <span>9:41</span>
                        <span>📶 📡 🔋</span>
                      </div>

                      {/* 扫一扫界面模拟 */}
                      <div className="bg-black rounded-lg p-4 mb-4">
                        <div className="aspect-square bg-gray-900 rounded flex items-center justify-center relative">
                          <div className="absolute inset-4 border-2 border-green-400 rounded"></div>
                          <div className="absolute top-0 left-0 w-8 h-8 border-l-4 border-t-4 border-green-400 rounded-tl"></div>
                          <div className="absolute top-0 right-0 w-8 h-8 border-r-4 border-t-4 border-green-400 rounded-tr"></div>
                          <div className="absolute bottom-0 left-0 w-8 h-8 border-l-4 border-b-4 border-green-400 rounded-bl"></div>
                          <div className="absolute bottom-0 right-0 w-8 h-8 border-r-4 border-b-4 border-green-400 rounded-br"></div>
                          <div className="w-full h-0.5 bg-green-400 animate-pulse absolute"></div>
                        </div>
                      </div>

                      {/* 操作提示 */}
                      <div className="space-y-3">
                        <div className="flex items-center gap-3 bg-white rounded-lg p-3">
                          <span className="text-2xl">📱</span>
                          <div>
                            <p className="font-medium text-sm">扫一扫</p>
                            <p className="text-xs text-gray-500">扫描二维码支付</p>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* 底部提示 */}
          <div className="text-center mt-6 text-sm text-gray-500">
            <p>支付后有问题请联系客服</p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function PayPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-gray-100 flex items-center justify-center">
          <div className="text-center">
            <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
            <p className="text-gray-500">加载中...</p>
          </div>
        </div>
      }
    >
      <PayContent />
    </Suspense>
  );
}
