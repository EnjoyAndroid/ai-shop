"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { AdminSidebar } from "@/components/admin/sidebar";
import { Suspense } from "react";

interface Order {
  id: string;
  orderNo: string;
  email: string | null;
  phone: string | null;
  payAmount: number;
  paymentMethod: string | null;
  status: string;
  createdAt: string;
  items: {
    product: { name: string };
  }[];
  user: {
    email: string | null;
    name: string | null;
  } | null;
}

function OrdersContent() {
  const searchParams = useSearchParams();
  const status = searchParams.get("status") || "";
  const page = parseInt(searchParams.get("page") || "1");

  const [orders, setOrders] = useState<Order[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  const limit = 20;
  const totalPages = Math.ceil(total / limit);

  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams();
    if (status) params.set("status", status);
    params.set("page", page.toString());

    fetch(`/api/admin/orders?${params}`)
      .then((res) => res.json())
      .then((data) => {
        setOrders(data.orders || []);
        setTotal(data.total || 0);
      })
      .catch((err) => {
        console.error("Failed to fetch orders:", err);
      })
      .finally(() => {
        setLoading(false);
      });
  }, [status, page]);

  const statusOptions = [
    { value: "", label: "全部" },
    { value: "PENDING", label: "待支付" },
    { value: "PAID", label: "已支付" },
    { value: "DELIVERED", label: "已发货" },
    { value: "COMPLETED", label: "已完成" },
    { value: "CANCELLED", label: "已取消" },
    { value: "REFUNDED", label: "已退款" },
  ];

  const getStatusLabel = (s: string) => {
    const labels: Record<string, string> = {
      PENDING: "待支付",
      PAID: "已支付",
      DELIVERED: "已发货",
      COMPLETED: "已完成",
      CANCELLED: "已取消",
      REFUNDED: "已退款",
    };
    return labels[s] || s;
  };

  const getStatusClass = (s: string) => {
    const classes: Record<string, string> = {
      DELIVERED: "bg-green-100 text-green-600",
      PENDING: "bg-yellow-100 text-yellow-600",
      PAID: "bg-blue-100 text-blue-600",
      CANCELLED: "bg-red-100 text-red-600",
      REFUNDED: "bg-purple-100 text-purple-600",
    };
    return classes[s] || "bg-gray-100 text-gray-600";
  };

  return (
    <>
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-2xl font-bold text-gray-800">订单管理</h1>
        <div className="text-sm text-gray-500">共 {total} 条记录</div>
      </div>

      {/* 状态筛选 */}
      <div className="bg-white rounded-xl p-4 mb-6 flex items-center gap-2">
        {statusOptions.map((option) => (
          <Link
            key={option.value}
            href={`/admin/orders${option.value ? `?status=${option.value}` : ""}`}
            className={`px-4 py-2 rounded-lg text-sm ${
              status === option.value
                ? "bg-primary text-white"
                : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }`}
          >
            {option.label}
          </Link>
        ))}
      </div>

      {/* 订单列表 */}
      <div className="bg-white rounded-xl shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-gray-500">加载中...</div>
        ) : orders.length === 0 ? (
          <div className="p-8 text-center text-gray-500">暂无订单</div>
        ) : (
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  订单号
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  用户/联系方式
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  商品
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  金额
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  支付方式
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  状态
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  时间
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  操作
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {orders.map((order) => (
                <tr key={order.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap font-mono text-sm">
                    {order.orderNo}
                  </td>
                  <td className="px-6 py-4 text-sm">
                    {order.user ? (
                      <div>
                        <p className="text-gray-900">{order.user.name || order.user.email}</p>
                        <p className="text-gray-500 text-xs">会员</p>
                      </div>
                    ) : (
                      <div>
                        <p className="text-gray-900">{order.email || order.phone}</p>
                        <p className="text-gray-500 text-xs">游客</p>
                      </div>
                    )}
                  </td>
                  <td className="px-6 py-4">
                    <div className="text-sm">
                      {order.items[0]?.product.name}
                      {order.items.length > 1 && (
                        <span className="text-gray-500"> 等{order.items.length}件</span>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap font-medium text-red-500">
                    ¥{(order.payAmount / 100).toFixed(2)}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-500">
                    {order.paymentMethod || "-"}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span
                      className={`px-2 py-1 text-xs rounded-full ${getStatusClass(order.status)}`}
                    >
                      {getStatusLabel(order.status)}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {new Date(order.createdAt).toLocaleString("zh-CN")}
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                      <Link
                        href={`/admin/orders/${order.id}`}
                        className="text-primary hover:underline text-sm"
                      >
                        详情
                      </Link>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* 分页 */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 mt-6">
          {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
            <Link
              key={p}
              href={`/admin/orders?${status ? `status=${status}&` : ""}page=${p}`}
              className={`px-4 py-2 rounded-lg ${
                p === page
                  ? "bg-primary text-white"
                  : "bg-white text-gray-600 hover:bg-gray-100"
              }`}
            >
              {p}
            </Link>
          ))}
        </div>
      )}
    </>
  );
}

export default function AdminOrdersPage() {
  return (
    <div className="flex min-h-screen bg-gray-100">
      <AdminSidebar />

      <main className="flex-1 p-8">
        <Suspense fallback={<div className="text-center py-8 text-gray-500">加载中...</div>}>
          <OrdersContent />
        </Suspense>
      </main>
    </div>
  );
}
