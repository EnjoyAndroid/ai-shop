"use client";

import { useState } from "react";
import Link from "next/link";
import { Header } from "@/components/shop/header";
import { OrderDetail } from "@/components/shop/order-detail";

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

  return (
    <div className="min-h-screen bg-gray-50">
      <Header />

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

          {/* 订单详情 - 使用共用组件 */}
          {order && (
            <OrderDetail
              order={order}
              showQueryPassword={false}
            />
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
