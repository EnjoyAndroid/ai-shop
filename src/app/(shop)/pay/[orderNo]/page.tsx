"use client";

import { useState, useEffect, Suspense } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ContactSupport } from "@/components/shop/contact-support";

function PayContent() {
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();

  const orderNo = params.orderNo as string;
  const password = searchParams.get("password") || "";
  const urlQrCode = searchParams.get("qrcode") || "";
  const urlAmount = searchParams.get("amount") || "";
  const urlMethod = searchParams.get("method") || "";
  const urlUsdtAmount = searchParams.get("usdt") || "";

  // 状态：优先使用 API 数据，URL 参数作为备用
  const [orderData, setOrderData] = useState<{
    payAmount: number;
    paymentMethod: string;
    qrCode: string;
    usdtAmount: string;
  } | null>(null);

  const [countdown, setCountdown] = useState<number | null>(null);
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(true);

  // 使用 API 数据或 URL 参数
  const amount = orderData?.payAmount || (urlAmount ? parseInt(urlAmount) : 0);
  const method = orderData?.paymentMethod || urlMethod || "WECHAT";
  const qrCode = orderData?.qrCode || urlQrCode;
  const usdtAmount = orderData?.usdtAmount || urlUsdtAmount;

  const isUSDT = method.startsWith("USDT");

  // 复制地址到剪贴板
  const copyAddress = async () => {
    if (qrCode) {
      await navigator.clipboard.writeText(qrCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  // 获取订单信息（金额、过期时间、二维码等）
  useEffect(() => {
    const fetchOrderData = async () => {
      try {
        // 先尝试获取支付信息（包含二维码）
        const payRes = await fetch(`/api/orders/${orderNo}/pay?password=${password}`);
        const payData = await payRes.json();

        if (payRes.ok && payData) {
          setOrderData({
            payAmount: payData.payAmount,
            paymentMethod: payData.paymentMethod,
            qrCode: payData.qrCode || urlQrCode,
            usdtAmount: payData.usdtAmount || urlUsdtAmount,
          });

          // 设置倒计时
          if (payData.expiredAt) {
            const expiredAt = new Date(payData.expiredAt).getTime();
            const now = Date.now();
            const remainingSeconds = Math.max(0, Math.floor((expiredAt - now) / 1000));
            setCountdown(remainingSeconds);
          } else {
            setCountdown(10 * 60);
          }
        } else {
          // 如果获取支付信息失败，尝试获取订单基本信息
          const res = await fetch(`/api/orders?orderNo=${orderNo}&password=${password}`);
          const data = await res.json();

          if (data.order) {
            setOrderData({
              payAmount: data.order.payAmount,
              paymentMethod: data.order.paymentMethod,
              qrCode: urlQrCode,
              usdtAmount: urlUsdtAmount,
            });

            if (data.order.expiredAt) {
              const expiredAt = new Date(data.order.expiredAt).getTime();
              const now = Date.now();
              const remainingSeconds = Math.max(0, Math.floor((expiredAt - now) / 1000));
              setCountdown(remainingSeconds);
            } else {
              setCountdown(10 * 60);
            }
          } else {
            setCountdown(10 * 60);
          }
        }
      } catch (e) {
        console.error("Fetch order data error:", e);
        setCountdown(10 * 60);
      } finally {
        setLoading(false);
      }
    };

    fetchOrderData();
  }, [orderNo, password, urlQrCode, urlUsdtAmount]);

  // 倒计时
  useEffect(() => {
    if (countdown === null || countdown <= 0) return;

    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev === null || prev <= 1) {
          clearInterval(timer);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [countdown !== null]); // 当 countdown 从 null 变成有值时触发

  // 轮询检查支付状态
  useEffect(() => {
    const checkPayment = async () => {
      try {
        // USDT 使用专用 API
        const apiUrl = isUSDT
          ? `/api/payment/usdt/check?orderNo=${orderNo}&password=${password}`
          : `/api/orders?orderNo=${orderNo}&password=${password}`;

        const res = await fetch(apiUrl);
        const data = await res.json();

        // 判断是否为充值订单（订单号以 R 开头）
        const isRechargeOrder = orderNo.startsWith("R");

        // USDT API 返回 paid: true
        if (data.paid) {
          if (isRechargeOrder) {
            router.push("/balance?recharge=success");
          } else {
            router.push(`/order/${orderNo}?password=${password}`);
          }
          return;
        }

        // 普通支付 API 返回 order.status（包含 COMPLETED 状态）
        if (data.order?.status === "DELIVERED" || data.order?.status === "PAID" || data.order?.status === "COMPLETED") {
          if (isRechargeOrder) {
            router.push("/balance?recharge=success");
          } else {
            router.push(`/order/${orderNo}?password=${password}`);
          }
        }
      } catch (e) {
        console.error("Check payment error:", e);
      }
    };

    // USDT 每 5 秒检查一次（区块链确认需要时间），其他每 3 秒
    const interval = setInterval(checkPayment, isUSDT ? 5000 : 3000);

    return () => clearInterval(interval);
  }, [orderNo, password, router, isUSDT]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  const isWechat = method === "WECHAT";
  const isAlipay = method === "ALIPAY";
  const methodLabel = isWechat ? "微信" : isAlipay ? "支付宝" : "USDT (TRON-TRC20)";
  const themeColor = isWechat ? "#07C160" : isAlipay ? "#1677FF" : "#26A17B";

  // 加载中状态
  if (loading || countdown === null) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <div className="text-center">
          <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-500">加载支付信息...</p>
        </div>
      </div>
    );
  }

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
            {isUSDT ? (
              /* USDT 支付界面 */
              <div className="p-8">
                {/* 标题 */}
                <div className="flex items-center justify-center gap-2 mb-6">
                  <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{ backgroundColor: "#26A17B" }}>
                    <span className="text-white font-bold text-lg">₮</span>
                  </div>
                  <span className="text-xl font-bold" style={{ color: "#26A17B" }}>
                    USDT (TRON-TRC20) 支付
                  </span>
                </div>

                {/* 订单信息 */}
                <div className="text-center mb-6">
                  <p className="text-gray-500 text-sm mb-2">订单号: {orderNo}</p>
                  <div className="flex items-center justify-center gap-4">
                    <div>
                      <p className="text-gray-500 text-sm">人民币金额</p>
                      <p className="text-2xl font-bold text-gray-800">¥ {(Number(amount) / 100).toFixed(2)}</p>
                    </div>
                    <div className="text-2xl text-gray-300">=</div>
                    <div>
                      <p className="text-gray-500 text-sm">USDT 金额</p>
                      <p className="text-2xl font-bold" style={{ color: "#26A17B" }}>
                        {usdtAmount || "计算中..."} USDT
                      </p>
                    </div>
                  </div>
                </div>

                {/* 收款地址 */}
                <div className="bg-gray-50 rounded-lg p-6 mb-6">
                  <p className="text-gray-600 text-sm mb-4 text-center">收款地址 (TRC20 网络)</p>

                  {/* 地址二维码 */}
                  <div className="flex justify-center mb-4">
                    <div className="p-3 bg-white rounded-lg border-2 border-gray-200">
                      <img
                        src={`https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(qrCode)}`}
                        alt="收款地址二维码"
                        className="w-44 h-44"
                      />
                    </div>
                  </div>

                  {/* 地址文本 */}
                  <div className="bg-white border-2 border-dashed border-gray-300 rounded-lg p-4">
                    <p className="font-mono text-sm text-center break-all text-gray-800 select-all">
                      {qrCode}
                    </p>
                  </div>
                  <button
                    onClick={copyAddress}
                    className="mt-4 w-full py-3 rounded-lg font-medium transition-colors flex items-center justify-center gap-2"
                    style={{
                      backgroundColor: copied ? "#22c55e" : "#26A17B",
                      color: "white",
                    }}
                  >
                    {copied ? (
                      <>
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                        已复制
                      </>
                    ) : (
                      <>
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                        </svg>
                        复制地址
                      </>
                    )}
                  </button>
                </div>

                {/* 重要提示 */}
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-6">
                  <div className="flex gap-3">
                    <span className="text-yellow-500 text-xl">⚠️</span>
                    <div className="text-sm text-yellow-800">
                      <p className="font-medium mb-1">转账注意事项：</p>
                      <ul className="list-disc list-inside space-y-1 text-yellow-700">
                        <li>请确保使用 <strong>TRC20</strong> 网络转账</li>
                        <li>转账金额必须为 <strong>{usdtAmount} USDT</strong></li>
                        <li>金额不符可能导致无法自动确认</li>
                        <li>区块确认通常需要 1 分钟左右</li>
                      </ul>
                    </div>
                  </div>
                </div>

                {/* 倒计时和状态 */}
                <div className="text-center">
                  <p className="text-red-500 text-sm font-medium mb-2">
                    请在 <span className="text-lg font-bold">{formatTime(countdown)}</span> 内完成转账
                  </p>
                  <div className="flex items-center justify-center gap-2 text-gray-500 text-sm">
                    <div className="w-4 h-4 border-2 border-green-500 border-t-transparent rounded-full animate-spin"></div>
                    正在监听区块链，转账后将自动确认...
                  </div>
                </div>
              </div>
            ) : (
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
                  ¥ {(Number(amount) / 100).toFixed(2)}
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
            )}
          </div>

          {/* 底部提示 */}
          <div className="mt-6">
            <ContactSupport prefix="支付后有问题请" />
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
