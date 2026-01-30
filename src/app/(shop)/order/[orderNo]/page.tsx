"use client";

import { useState, useEffect, Suspense } from "react";
import { useParams, useSearchParams } from "next/navigation";
import Link from "next/link";
import { HeaderClient } from "@/components/shop/header-client";
import { OrderDetail } from "@/components/shop/order-detail";

function OrderDetailContent() {
  const params = useParams();
  const searchParams = useSearchParams();
  const orderNo = params.orderNo as string;
  const password = searchParams.get("password") || "";

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [order, setOrder] = useState<any>(null);

  // 判断是否为充值订单
  const isRechargeOrder = orderNo.startsWith("R");
  const pageTitle = isRechargeOrder ? "余额充值订单详情" : "订单详情";

  useEffect(() => {
    const fetchOrder = async () => {
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

    fetchOrder();
  }, [orderNo, password]);

  return (
    <>
      {/* 加载中 */}
      {loading && (
        <div className="bg-white rounded-xl p-12 text-center">
          <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full mx-auto mb-4"></div>
          <p className="text-gray-500">正在加载订单信息...</p>
        </div>
      )}

      {/* 错误提示 */}
      {error && (
        <div className="bg-white rounded-xl p-6">
          <div className="p-4 bg-red-50 text-red-600 rounded-lg text-center">
            {error}
          </div>
          <div className="mt-4 text-center">
            <Link href="/order" className="text-primary hover:underline">
              返回订单查询
            </Link>
          </div>
        </div>
      )}

      {/* 订单详情 - 使用共用组件 */}
      {order && (
        <>
          <h1 className="text-2xl font-bold text-gray-800 mb-6 text-center">
            {isRechargeOrder ? "余额充值订单详情" : "商品订单详情"}
          </h1>
          <OrderDetail
            order={order}
            showQueryPassword={true}
            queryPassword={password}
          />
        </>
      )}
    </>
  );
}

export default function OrderDetailPage() {
  return (
    <div className="min-h-screen bg-gray-50">
      <HeaderClient />

      <main className="container mx-auto px-4 py-8">
        <div className="max-w-2xl mx-auto">
          <Suspense
            fallback={
              <div className="bg-white rounded-xl p-12 text-center">
                <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full mx-auto mb-4"></div>
                <p className="text-gray-500">正在加载订单信息...</p>
              </div>
            }
          >
            <OrderDetailContent />
          </Suspense>

          {/* 提示信息 */}
          <div className="mt-8 text-center text-sm text-gray-500">
            <p>如有问题，请联系客服</p>
          </div>
        </div>
      </main>
    </div>
  );
}
