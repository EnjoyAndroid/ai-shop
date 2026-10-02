"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { getOrderStatusInfo } from "@/lib/order-status";

interface OrderDetailProps {
  order: any;
  showQueryPassword?: boolean;
  queryPassword?: string;
}

export function OrderDetail({ order, showQueryPassword = false, queryPassword }: OrderDetailProps) {
  const router = useRouter();
  const [toast, setToast] = useState("");
  const [countdown, setCountdown] = useState("");
  const [expired, setExpired] = useState(false);

  // 继续支付
  const handleContinuePay = () => {
    const params = new URLSearchParams();
    if (queryPassword) {
      params.set("password", queryPassword);
    }
    router.push(`/pay/${order.orderNo}?${params.toString()}`);
  };

  // 倒计时
  useEffect(() => {
    if (order.status !== "PENDING" || !order.expiredAt) return;

    const updateCountdown = () => {
      const now = Date.now();
      const expireTime = new Date(order.expiredAt).getTime();
      const diff = expireTime - now;

      if (diff <= 0) {
        setExpired(true);
        setCountdown("已超时");
        return;
      }

      const minutes = Math.floor(diff / 60000);
      const seconds = Math.floor((diff % 60000) / 1000);
      setCountdown(`${minutes}:${seconds.toString().padStart(2, "0")}`);
    };

    updateCountdown();
    const timer = setInterval(updateCountdown, 1000);

    return () => clearInterval(timer);
  }, [order.status, order.expiredAt]);

  const showToast = (message: string) => {
    setToast(message);
    setTimeout(() => setToast(""), 2000);
  };

  const copyToClipboard = (text: string, label: string = "已复制") => {
    navigator.clipboard.writeText(text);
    showToast(label);
  };

  // 下载密钥为txt文件
  const downloadCardKeys = () => {
    if (!order.items) return;

    let content = `订单号: ${order.orderNo}\n`;
    if (queryPassword) {
      content += `查询密码: ${queryPassword}\n`;
    }
    content += `================================\n\n`;

    order.items.forEach((item: any) => {
      if (item.cardKeys?.length > 0) {
        content += `【${item.productName}】\n`;
        item.cardKeys.forEach((cardKey: any, index: number) => {
          content += `${index + 1}. ${cardKey.content}\n`;
        });
        content += `\n`;
      }
    });

    content += `================================\n`;
    content += `来自 example.com\n`;

    const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `卡密_example.com.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    showToast("密钥文件已下载");
  };


  return (
    <>
      {/* Toast 提示 */}
      {toast && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 z-50 px-4 py-2 bg-green-500 text-white rounded-lg shadow-lg animate-fade-in">
          {toast}
        </div>
      )}

      <div className="bg-white rounded-xl p-6">
      {/* 订单状态 */}
      <div className="flex items-center justify-between mb-6 pb-6 border-b">
        <div>
          <p className="text-gray-500 text-sm">订单号</p>
          <p className="font-mono font-bold">{order.orderNo}</p>
        </div>
        <span
          className={`px-4 py-2 rounded-full text-sm font-medium ${
            getOrderStatusInfo(order.status).color
          }`}
        >
          {getOrderStatusInfo(order.status).text}
        </span>
      </div>

      {/* 查询密码提示 */}
      {showQueryPassword && queryPassword && (
        <div className="mb-6 p-4 bg-blue-50 rounded-lg border border-blue-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-blue-700">🔑 订单查询密码</p>
              <p className="font-mono font-bold text-blue-900 text-lg">{queryPassword}</p>
            </div>
            <button
              onClick={() => copyToClipboard(queryPassword, "已复制查询密码")}
              className="px-3 py-1 bg-blue-500 text-white text-sm rounded hover:bg-blue-600"
            >
              复制
            </button>
          </div>
          <p className="text-xs text-blue-600 mt-2">
            请保存此密码，用于以后查询订单
          </p>
        </div>
      )}

      {/* 订单信息 */}
      <div className="mb-6">
        <h3 className="font-semibold text-gray-800 mb-3">订单信息</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
          <div>
            <span className="text-gray-500">创建时间:</span>
            <span className="ml-2">
              {new Date(order.createdAt).toLocaleString("zh-CN")}
            </span>
          </div>
          <div>
            <span className="text-gray-500">支付方式:</span>
            <span className="ml-2">{order.paymentMethod || "-"}</span>
          </div>
          <div>
            <span className="text-gray-500">联系邮箱:</span>
            <span className="ml-2">{order.email || "-"}</span>
          </div>
        </div>
      </div>

      {/* 商品列表 */}
      <div className="mb-6">
        <h3 className="font-semibold text-gray-800 mb-3">商品明细</h3>
        <div className="space-y-3">
          {order.items?.map((item: any) => (
            <div
              key={item.id}
              className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
            >
              <div>
                <p className="font-medium">{item.productName}</p>
                <p className="text-sm text-gray-500">
                  ¥{(item.price / 100).toFixed(2)} × {item.quantity}
                </p>
              </div>
              <p className="font-bold text-red-500">
                ¥{((item.price * item.quantity) / 100).toFixed(2)}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* 金额汇总 */}
      <div className="mb-6 p-4 bg-gray-50 rounded-lg">
        <div className="flex justify-between text-sm mb-2">
          <span className="text-gray-500">商品总价</span>
          <span>¥{(order.totalAmount / 100).toFixed(2)}</span>
        </div>
        {order.discountAmount > 0 && (
          <div className="flex justify-between text-sm mb-2">
            <span className="text-gray-500">会员折扣</span>
            <span className="text-green-500">
              -¥{(order.discountAmount / 100).toFixed(2)}
            </span>
          </div>
        )}
        <div className="flex justify-between font-bold pt-2 border-t">
          <span>实付金额</span>
          <span className="text-red-500">
            ¥{(order.payAmount / 100).toFixed(2)}
          </span>
        </div>
      </div>

      {/* 卡密信息 */}
      {order.status === "DELIVERED" && order.items?.some((item: any) => item.cardKeys?.length > 0) && (
        <div className="p-4 bg-green-50 rounded-lg border border-green-200">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-green-800 flex items-center gap-2">
              <span>🎉</span> 您的卡密
            </h3>
            <button
              onClick={downloadCardKeys}
              className="px-3 py-1.5 bg-green-600 text-white text-sm rounded-lg hover:bg-green-700 flex items-center gap-1"
            >
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
              </svg>
              下载密钥
            </button>
          </div>
          {order.items.map((item: any) => (
            <div key={item.id} className="mb-4 last:mb-0">
              <p className="text-sm text-green-700 mb-2">
                {item.productName}:
              </p>
              <div className="space-y-2">
                {item.cardKeys?.map((cardKey: any) => (
                  <div
                    key={cardKey.id}
                    className="p-3 bg-white rounded border border-green-200 font-mono text-sm break-all flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2"
                  >
                    <span className="overflow-x-auto max-w-full">{cardKey.content}</span>
                    <button
                      onClick={() => copyToClipboard(cardKey.content, "已复制卡密")}
                      className="ml-2 px-2 py-1 bg-green-500 text-white text-xs rounded hover:bg-green-600"
                    >
                      复制
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ))}
          <p className="text-xs text-green-600 mt-3">
            💡 请妥善保管您的卡密信息
          </p>
        </div>
      )}

      {/* 支付成功提示 */}
      {order.status === "PAID" && (
        <div className="p-4 bg-blue-50 rounded-lg border border-blue-200">
          <p className="text-blue-800">
            ✅ 支付成功！卡密将在 1-5 分钟内发送到您的邮箱
          </p>
        </div>
      )}

      {/* 待支付提示 */}
      {order.status === "PENDING" && (
        <div className={`p-4 rounded-lg border ${expired ? "bg-red-50 border-red-200" : "bg-yellow-50 border-yellow-200"}`}>
          {expired ? (
            <p className="text-red-800">
              ❌ 订单已超时，请重新下单
            </p>
          ) : (
            <>
              <div className="flex items-center justify-between">
                <p className="text-yellow-800">
                  ⏳ 订单待支付
                </p>
                <div className="flex items-center gap-2">
                  <span className="text-yellow-600 text-sm">剩余时间</span>
                  <span className="px-3 py-1 bg-yellow-500 text-white font-mono font-bold rounded-lg text-lg">
                    {countdown}
                  </span>
                </div>
              </div>
              <button
                onClick={handleContinuePay}
                className="mt-3 px-4 py-2 bg-yellow-500 text-white rounded-lg hover:bg-yellow-600"
              >
                继续支付
              </button>
            </>
          )}
        </div>
      )}
    </div>
    </>
  );
}
