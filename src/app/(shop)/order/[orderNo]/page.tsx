"use client";

import { useState, useEffect, Suspense } from "react";
import { useParams, useRouter } from "next/navigation";
import { orderAccessHeaders, orderAccessUrl, orderReturnUrl } from "@/lib/order-client";
import Link from "next/link";
import { HeaderClient } from "@/components/shop/header-client";
import { OrderDetail } from "@/components/shop/order-detail";
import { ContactSupport } from "@/components/shop/contact-support";

function OrderDetailContent() {
  const params = useParams();
  const router = useRouter();
  const orderNo = params.orderNo as string;
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [order, setOrder] = useState<any>(null);
  const [returnUrl, setReturnUrl] = useState("/order");

  // 判断是否为充值订单
  const isRechargeOrder = orderNo.startsWith("R");

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setOrder(null);
    setError("");
    setReturnUrl(orderReturnUrl(orderNo));
    const fetchOrder = async () => {
      try {
        const response = await fetch(
          `/api/orders/${encodeURIComponent(orderNo)}`, { headers: orderAccessHeaders(orderNo), cache: "no-store", signal: controller.signal }
        );
        const data = await response.json();

        if (data.code === "ORDER_ACCESS_REQUIRED") {
          router.replace(orderAccessUrl(orderNo));
          return;
        }
        if (!response.ok) {
          throw new Error(data.error || "查询失败");
        }

        if (!controller.signal.aborted) setOrder(data.order);
      } catch (err) {
        if (!controller.signal.aborted) setError(err instanceof Error ? err.message : "查询失败");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    };

    void fetchOrder();
    return () => controller.abort();
  }, [orderNo, router]);

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
          <div className="mb-4"><Link href={returnUrl} className="text-primary hover:underline">← {returnUrl === "/order" ? "返回订单查询" : "返回订单列表"}</Link></div>
          <OrderDetail order={order} />
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
          <div className="mt-8">
            <ContactSupport />
          </div>
        </div>
      </main>
    </div>
  );
}
