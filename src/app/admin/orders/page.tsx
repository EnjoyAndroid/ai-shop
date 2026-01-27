import Link from "next/link";
import prisma from "@/lib/db";
import { AdminSidebar } from "@/components/admin/sidebar";

export default async function AdminOrdersPage({
  searchParams,
}: {
  searchParams: { status?: string; page?: string };
}) {
  const status = searchParams.status;
  const page = parseInt(searchParams.page || "1");
  const limit = 20;

  const where = status ? { status: status as any } : {};

  const [orders, total] = await Promise.all([
    prisma.order.findMany({
      where,
      include: {
        items: {
          include: {
            product: { select: { name: true } },
          },
        },
        user: { select: { email: true, name: true } },
      },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.order.count({ where }),
  ]);

  const totalPages = Math.ceil(total / limit);

  const statusOptions = [
    { value: "", label: "全部" },
    { value: "PENDING", label: "待支付" },
    { value: "PAID", label: "已支付" },
    { value: "DELIVERED", label: "已发货" },
    { value: "COMPLETED", label: "已完成" },
    { value: "CANCELLED", label: "已取消" },
    { value: "REFUNDED", label: "已退款" },
  ];

  return (
    <div className="flex min-h-screen bg-gray-100">
      <AdminSidebar />

      <main className="flex-1 p-8">
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
                (status || "") === option.value
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
                      className={`px-2 py-1 text-xs rounded-full ${
                        order.status === "DELIVERED"
                          ? "bg-green-100 text-green-600"
                          : order.status === "PENDING"
                          ? "bg-yellow-100 text-yellow-600"
                          : order.status === "PAID"
                          ? "bg-blue-100 text-blue-600"
                          : order.status === "CANCELLED"
                          ? "bg-red-100 text-red-600"
                          : order.status === "REFUNDED"
                          ? "bg-purple-100 text-purple-600"
                          : "bg-gray-100 text-gray-600"
                      }`}
                    >
                      {order.status === "PENDING"
                        ? "待支付"
                        : order.status === "PAID"
                        ? "已支付"
                        : order.status === "DELIVERED"
                        ? "已发货"
                        : order.status === "COMPLETED"
                        ? "已完成"
                        : order.status === "CANCELLED"
                        ? "已取消"
                        : order.status === "REFUNDED"
                        ? "已退款"
                        : order.status}
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
      </main>
    </div>
  );
}
