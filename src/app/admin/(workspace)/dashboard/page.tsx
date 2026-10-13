import { redirect } from "next/navigation";
import Link from "next/link";
import prisma from "@/lib/db";
import { getAdminSession } from "@/lib/admin-auth";
import { getOrderStatusInfo } from "@/lib/order-status";

// 强制动态渲染，避免构建时访问数据库
export const dynamic = "force-dynamic";

export default async function AdminDashboardPage() {
  // 验证管理员登录
  const session = await getAdminSession();
  if (!session) {
    redirect("/admin/login");
  }

  // 获取统计数据
  const [
    totalOrders,
    todayOrders,
    totalRevenue,
    todayRevenue,
    totalProducts,
    totalUsers,
    pendingOrders,
    lowStockProducts,
  ] = await Promise.all([
    prisma.order.count(),
    prisma.order.count({
      where: {
        createdAt: {
          gte: new Date(new Date().setHours(0, 0, 0, 0)),
        },
      },
    }),
    prisma.order.aggregate({
      where: { status: { in: ["PAID", "DELIVERED", "COMPLETED"] } },
      _sum: { payAmount: true },
    }),
    prisma.order.aggregate({
      where: {
        status: { in: ["PAID", "DELIVERED", "COMPLETED"] },
        paidAt: {
          gte: new Date(new Date().setHours(0, 0, 0, 0)),
        },
      },
      _sum: { payAmount: true },
    }),
    prisma.product.count({ where: { isActive: true } }),
    prisma.user.count({ where: { status: "ACTIVE" } }),
    prisma.order.count({ where: { status: "PENDING" } }),
    prisma.product.count({
      where: { isActive: true, stock: { lt: 10 } },
    }),
  ]);

  // 最近订单
  const recentOrders = await prisma.order.findMany({
    take: 10,
    orderBy: { createdAt: "desc" },
    include: {
      items: {
        include: {
          product: { select: { name: true } },
        },
      },
    },
  });

  const stats = [
    {
      title: "总订单数",
      value: totalOrders,
      icon: "📦",
      color: "bg-blue-500",
    },
    {
      title: "今日订单",
      value: todayOrders,
      icon: "📋",
      color: "bg-green-500",
    },
    {
      title: "总收入",
      value: `¥${((totalRevenue._sum.payAmount || 0) / 100).toFixed(2)}`,
      icon: "💰",
      color: "bg-yellow-500",
    },
    {
      title: "今日收入",
      value: `¥${((todayRevenue._sum.payAmount || 0) / 100).toFixed(2)}`,
      icon: "💵",
      color: "bg-purple-500",
    },
    {
      title: "商品数量",
      value: totalProducts,
      icon: "🛍️",
      color: "bg-pink-500",
    },
    {
      title: "用户数量",
      value: totalUsers,
      icon: "👥",
      color: "bg-indigo-500",
    },
    {
      title: "待处理订单",
      value: pendingOrders,
      icon: "⏳",
      color: "bg-orange-500",
    },
    {
      title: "库存预警",
      value: lowStockProducts,
      icon: "⚠️",
      color: "bg-red-500",
    },
  ];

  return (
    <>
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-2xl font-bold text-gray-800">仪表盘</h1>
          <div className="text-sm text-gray-500">
            欢迎回来，{session.name || session.username}
          </div>
        </div>

        {/* 统计卡片 */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          {stats.map((stat, index) => (
            <div
              key={index}
              className="bg-white rounded-xl p-6 shadow-sm hover:shadow-md transition-shadow"
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-gray-500 text-sm">{stat.title}</p>
                  <p className="text-2xl font-bold text-gray-800 mt-1">
                    {stat.value}
                  </p>
                </div>
                <div
                  className={`w-12 h-12 ${stat.color} rounded-full flex items-center justify-center text-2xl`}
                >
                  {stat.icon}
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* 最近订单 */}
        <div className="bg-white rounded-xl shadow-sm">
          <div className="p-6 border-b">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-gray-800">最近订单</h2>
              <Link
                href="/admin/orders"
                className="text-primary text-sm hover:underline"
              >
                查看全部 →
              </Link>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    订单号
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    商品
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    金额
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    状态
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    时间
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {recentOrders.length > 0 ? (
                  recentOrders.map((order) => (
                    <tr key={order.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap font-mono text-sm">
                        {order.orderNo}
                      </td>
                      <td className="px-6 py-4">
                        <div className="text-sm text-gray-900">
                          {order.orderNo.startsWith("R")
                            ? "余额充值"
                            : order.items[0]?.product.name
                            ? `${order.items[0]?.product.name}${order.items.length > 1 ? ` 等${order.items.length}件` : ""}`
                            : "-"}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-red-500">
                        ¥{(order.payAmount / 100).toFixed(2)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span
                          className={`px-2 py-1 text-xs rounded-full ${
                            getOrderStatusInfo(order.status).color
                          }`}
                        >
                          {getOrderStatusInfo(order.status).text}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {new Date(order.createdAt).toLocaleString("zh-CN")}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={5} className="px-6 py-8 text-center text-gray-500">
                      暂无订单
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </>
  );
}
