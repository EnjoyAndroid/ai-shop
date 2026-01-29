"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { AdminSidebar } from "@/components/admin/sidebar";

interface OrderDetail {
  id: string;
  orderNo: string;
  email: string | null;
  phone: string | null;
  queryPassword: string;
  totalAmount: number;
  discountAmount: number;
  payAmount: number;
  paymentMethod: string | null;
  paymentNo: string | null;
  status: string;
  ip: string | null;
  userAgent: string | null;
  adminRemark: string | null;
  createdAt: string;
  paidAt: string | null;
  expiredAt: string | null;
  items: {
    id: string;
    productName: string;
    price: number;
    quantity: number;
    cardKeys: {
      id: string;
      content: string;
    }[];
  }[];
  user: {
    id: string;
    email: string | null;
    name: string | null;
  } | null;
}

export default function AdminOrderDetailPage() {
  const params = useParams();
  const router = useRouter();
  const orderId = params.id as string;

  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [actionLoading, setActionLoading] = useState(false);

  useEffect(() => {
    fetch(`/api/admin/orders/${orderId}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.error) {
          setError(data.error);
        } else {
          setOrder(data.order);
        }
      })
      .catch((err) => {
        setError("获取订单失败");
      })
      .finally(() => {
        setLoading(false);
      });
  }, [orderId]);

  const handleAction = async (action: string) => {
    if (!confirm(`确定要${action === "deliver" ? "手动发货" : action === "refund" ? "退款" : "取消"}此订单吗？`)) {
      return;
    }

    setActionLoading(true);
    try {
      const res = await fetch(`/api/admin/orders/${orderId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "操作失败");
      }

      // 刷新订单数据
      setOrder(data.order);
    } catch (err) {
      alert(err instanceof Error ? err.message : "操作失败");
    } finally {
      setActionLoading(false);
    }
  };

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
    <div className="flex min-h-screen bg-gray-100">
      <AdminSidebar />

      <main className="flex-1 p-8">
        {/* 顶部导航 */}
        <div className="flex items-center gap-4 mb-8">
          <Link
            href="/admin/orders"
            className="text-gray-500 hover:text-gray-700"
          >
            ← 返回订单列表
          </Link>
        </div>

        {loading ? (
          <div className="text-center py-8 text-gray-500">加载中...</div>
        ) : error ? (
          <div className="bg-white rounded-xl p-8 text-center">
            <p className="text-red-500 mb-4">{error}</p>
            <Link href="/admin/orders" className="text-primary hover:underline">
              返回订单列表
            </Link>
          </div>
        ) : order ? (
          <div className="space-y-6">
            {/* 订单头部 */}
            <div className="bg-white rounded-xl p-6">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h1 className="text-2xl font-bold text-gray-800">
                    订单详情
                  </h1>
                  <p className="text-gray-500 font-mono">{order.orderNo}</p>
                </div>
                <span
                  className={`px-4 py-2 rounded-full text-sm font-medium ${getStatusClass(
                    order.status
                  )}`}
                >
                  {getStatusLabel(order.status)}
                </span>
              </div>

              {/* 操作按钮 */}
              <div className="flex gap-3">
                {order.status === "PAID" && (
                  <button
                    onClick={() => handleAction("deliver")}
                    disabled={actionLoading}
                    className="px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 disabled:opacity-50"
                  >
                    手动发货
                  </button>
                )}
                {["PAID", "DELIVERED"].includes(order.status) && (
                  <button
                    onClick={() => handleAction("refund")}
                    disabled={actionLoading}
                    className="px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 disabled:opacity-50"
                  >
                    退款
                  </button>
                )}
                {order.status === "PENDING" && (
                  <button
                    onClick={() => handleAction("cancel")}
                    disabled={actionLoading}
                    className="px-4 py-2 bg-gray-500 text-white rounded-lg hover:bg-gray-600 disabled:opacity-50"
                  >
                    取消订单
                  </button>
                )}
              </div>
            </div>

            {/* 订单信息 */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* 基本信息 */}
              <div className="bg-white rounded-xl p-6">
                <h2 className="text-lg font-bold text-gray-800 mb-4">
                  基本信息
                </h2>
                <div className="space-y-3 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-500">订单号</span>
                    <span className="font-mono">{order.orderNo}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">查询密码</span>
                    <span className="font-mono">{order.queryPassword}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">创建时间</span>
                    <span>{new Date(order.createdAt).toLocaleString("zh-CN")}</span>
                  </div>
                  {order.paidAt && (
                    <div className="flex justify-between">
                      <span className="text-gray-500">支付时间</span>
                      <span>{new Date(order.paidAt).toLocaleString("zh-CN")}</span>
                    </div>
                  )}
                  {order.expiredAt && order.status === "PENDING" && (
                    <div className="flex justify-between">
                      <span className="text-gray-500">过期时间</span>
                      <span>{new Date(order.expiredAt).toLocaleString("zh-CN")}</span>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <span className="text-gray-500">支付方式</span>
                    <span>{order.paymentMethod || "-"}</span>
                  </div>
                  {order.paymentNo && (
                    <div className="flex justify-between">
                      <span className="text-gray-500">支付单号</span>
                      <span className="font-mono text-xs">{order.paymentNo}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* 用户信息 */}
              <div className="bg-white rounded-xl p-6">
                <h2 className="text-lg font-bold text-gray-800 mb-4">
                  用户信息
                </h2>
                <div className="space-y-3 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-500">用户类型</span>
                    <span>{order.user ? "会员" : "游客"}</span>
                  </div>
                  {order.user && (
                    <div className="flex justify-between">
                      <span className="text-gray-500">会员邮箱</span>
                      <span>{order.user.email}</span>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <span className="text-gray-500">联系邮箱</span>
                    <span>{order.email || "-"}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">联系手机</span>
                    <span>{order.phone || "-"}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">IP 地址</span>
                    <span className="font-mono text-xs">{order.ip || "-"}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* 商品信息 */}
            <div className="bg-white rounded-xl p-6">
              <h2 className="text-lg font-bold text-gray-800 mb-4">商品信息</h2>
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-2 text-left">商品名称</th>
                    <th className="px-4 py-2 text-right">单价</th>
                    <th className="px-4 py-2 text-right">数量</th>
                    <th className="px-4 py-2 text-right">小计</th>
                  </tr>
                </thead>
                <tbody>
                  {order.items.map((item) => (
                    <tr key={item.id} className="border-t">
                      <td className="px-4 py-3">{item.productName}</td>
                      <td className="px-4 py-3 text-right">
                        ¥{(item.price / 100).toFixed(2)}
                      </td>
                      <td className="px-4 py-3 text-right">{item.quantity}</td>
                      <td className="px-4 py-3 text-right font-medium">
                        ¥{((item.price * item.quantity) / 100).toFixed(2)}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="border-t bg-gray-50">
                  <tr>
                    <td colSpan={3} className="px-4 py-3 text-right">
                      商品总价
                    </td>
                    <td className="px-4 py-3 text-right">
                      ¥{(order.totalAmount / 100).toFixed(2)}
                    </td>
                  </tr>
                  {order.discountAmount > 0 && (
                    <tr>
                      <td colSpan={3} className="px-4 py-3 text-right">
                        会员折扣
                      </td>
                      <td className="px-4 py-3 text-right text-green-500">
                        -¥{(order.discountAmount / 100).toFixed(2)}
                      </td>
                    </tr>
                  )}
                  <tr className="font-bold">
                    <td colSpan={3} className="px-4 py-3 text-right">
                      实付金额
                    </td>
                    <td className="px-4 py-3 text-right text-red-500">
                      ¥{(order.payAmount / 100).toFixed(2)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>

            {/* 卡密信息 */}
            {order.items.some((item) => item.cardKeys.length > 0) && (
              <div className="bg-white rounded-xl p-6">
                <h2 className="text-lg font-bold text-gray-800 mb-4">
                  卡密信息
                </h2>
                <div className="space-y-4">
                  {order.items.map((item) =>
                    item.cardKeys.length > 0 ? (
                      <div key={item.id}>
                        <p className="text-sm text-gray-600 mb-2">
                          {item.productName}:
                        </p>
                        <div className="space-y-2">
                          {item.cardKeys.map((cardKey) => (
                            <div
                              key={cardKey.id}
                              className="p-3 bg-gray-50 rounded font-mono text-sm break-all"
                            >
                              {cardKey.content}
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : null
                  )}
                </div>
              </div>
            )}

            {/* 备注信息 */}
            {order.adminRemark && (
              <div className="bg-white rounded-xl p-6">
                <h2 className="text-lg font-bold text-gray-800 mb-4">
                  管理员备注
                </h2>
                <p className="text-gray-600">{order.adminRemark}</p>
              </div>
            )}
          </div>
        ) : null}
      </main>
    </div>
  );
}
