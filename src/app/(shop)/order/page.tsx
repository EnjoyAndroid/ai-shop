"use client";

import { useState } from "react";
import Link from "next/link";

export default function OrderQueryPage() {
  const [orderNo, setOrderNo] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [order, setOrder] = useState<any>(null);

  const handleQuery = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!orderNo.trim()) {
      setError("请输入订单号");
      return;
    }

    setLoading(true);
    setError("");
    setOrder(null);

    try {
      const response = await fetch(
        `/api/orders?orderNo=${encodeURIComponent(orderNo)}&password=${encodeURIComponent(password)}`
      );
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "查询失败");
      }

      setOrder(data.order);
    } catch (err) {
      setError(err instanceof Error ? err.message : "查询失败");
    } finally {
      setLoading(false);
    }
  };

  const getStatusText = (status: string) => {
    const statusMap: Record<string, { text: string; color: string }> = {
      PENDING: { text: "待支付", color: "bg-yellow-100 text-yellow-600" },
      PAID: { text: "已支付", color: "bg-blue-100 text-blue-600" },
      DELIVERED: { text: "已发货", color: "bg-green-100 text-green-600" },
      COMPLETED: { text: "已完成", color: "bg-gray-100 text-gray-600" },
      CANCELLED: { text: "已取消", color: "bg-red-100 text-red-600" },
      REFUNDED: { text: "已退款", color: "bg-purple-100 text-purple-600" },
    };
    return statusMap[status] || { text: status, color: "bg-gray-100 text-gray-600" };
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* 顶部导航 */}
      <header className="bg-white shadow-sm sticky top-0 z-50">
        <div className="container mx-auto px-4">
          <div className="flex items-center justify-between h-16">
            <Link href="/" className="text-xl font-bold text-primary">
              AI Shop
            </Link>
            <nav className="flex items-center space-x-6">
              <Link href="/" className="text-gray-600 hover:text-primary">
                首页
              </Link>
              <Link href="/order" className="text-primary font-medium">
                订单查询
              </Link>
            </nav>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        <div className="max-w-2xl mx-auto">
          <h1 className="text-2xl font-bold text-gray-800 mb-8 text-center">
            订单查询
          </h1>

          {/* 查询表单 */}
          <form onSubmit={handleQuery} className="bg-white rounded-xl p-6 mb-8">
            {error && (
              <div className="mb-4 p-3 bg-red-50 text-red-600 rounded-lg text-sm">
                {error}
              </div>
            )}

            <div className="space-y-4">
              <div>
                <label className="block text-sm text-gray-600 mb-1">
                  订单号 <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={orderNo}
                  onChange={(e) => setOrderNo(e.target.value)}
                  placeholder="请输入订单号"
                  className="w-full px-4 py-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50"
                />
              </div>

              <div>
                <label className="block text-sm text-gray-600 mb-1">
                  查询密码
                </label>
                <input
                  type="text"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="游客订单需要输入查询密码"
                  className="w-full px-4 py-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50"
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 bg-primary text-white rounded-lg font-semibold hover:bg-primary/90 disabled:opacity-50"
              >
                {loading ? "查询中..." : "查询订单"}
              </button>
            </div>
          </form>

          {/* 订单详情 */}
          {order && (
            <div className="bg-white rounded-xl p-6">
              {/* 订单状态 */}
              <div className="flex items-center justify-between mb-6 pb-6 border-b">
                <div>
                  <p className="text-gray-500 text-sm">订单号</p>
                  <p className="font-mono font-bold">{order.orderNo}</p>
                </div>
                <span
                  className={`px-4 py-2 rounded-full text-sm font-medium ${
                    getStatusText(order.status).color
                  }`}
                >
                  {getStatusText(order.status).text}
                </span>
              </div>

              {/* 订单信息 */}
              <div className="mb-6">
                <h3 className="font-semibold text-gray-800 mb-3">订单信息</h3>
                <div className="grid grid-cols-2 gap-4 text-sm">
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
                  <div>
                    <span className="text-gray-500">联系手机:</span>
                    <span className="ml-2">{order.phone || "-"}</span>
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
                  <h3 className="font-semibold text-green-800 mb-3 flex items-center gap-2">
                    <span>🎉</span> 您的卡密
                  </h3>
                  {order.items.map((item: any) => (
                    <div key={item.id} className="mb-4 last:mb-0">
                      <p className="text-sm text-green-700 mb-2">
                        {item.productName}:
                      </p>
                      <div className="space-y-2">
                        {item.cardKeys?.map((cardKey: any, index: number) => (
                          <div
                            key={cardKey.id}
                            className="p-3 bg-white rounded border border-green-200 font-mono text-sm break-all"
                          >
                            {/* 显示解密后的卡密 - 实际需要后端解密 */}
                            卡密 {index + 1}: [已加密存储，请查看邮件]
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                  <p className="text-xs text-green-600 mt-3">
                    💡 卡密已发送至您的邮箱，请注意查收
                  </p>
                </div>
              )}

              {/* 待支付提示 */}
              {order.status === "PENDING" && (
                <div className="p-4 bg-yellow-50 rounded-lg border border-yellow-200">
                  <p className="text-yellow-800">
                    ⏳ 订单待支付，请在{" "}
                    <span className="font-bold">
                      {new Date(order.expiredAt).toLocaleString("zh-CN")}
                    </span>{" "}
                    前完成支付
                  </p>
                  <button className="mt-3 px-4 py-2 bg-yellow-500 text-white rounded-lg hover:bg-yellow-600">
                    继续支付
                  </button>
                </div>
              )}
            </div>
          )}

          {/* 提示信息 */}
          <div className="mt-8 text-center text-sm text-gray-500">
            <p>如有问题，请联系客服</p>
          </div>
        </div>
      </main>
    </div>
  );
}
