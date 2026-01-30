import { redirect } from "next/navigation";
import Link from "next/link";
import { auth } from "@/lib/auth";
import prisma from "@/lib/db";

// 强制动态渲染，避免构建时访问数据库
export const dynamic = "force-dynamic";

export default async function UserDashboardPage() {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    include: {
      level: true,
      _count: {
        select: { orders: true },
      },
    },
  });

  if (!user) {
    redirect("/login");
  }

  const recentOrders = await prisma.order.findMany({
    where: { userId: user.id },
    take: 5,
    orderBy: { createdAt: "desc" },
    include: {
      items: {
        include: {
          product: { select: { name: true } },
        },
      },
    },
  });

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
              <span className="text-gray-600">{user.name || user.email}</span>
            </nav>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
          {/* 侧边栏 */}
          <aside className="lg:col-span-1">
            <div className="bg-white rounded-xl p-6 sticky top-24">
              <div className="text-center mb-6">
                <div className="w-20 h-20 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
                  <span className="text-3xl">👤</span>
                </div>
                <h2 className="font-bold text-gray-800">{user.name || "用户"}</h2>
                <p className="text-sm text-gray-500">{user.email}</p>
                {user.level && (
                  <span className="inline-block mt-2 px-3 py-1 bg-yellow-100 text-yellow-600 text-xs rounded-full">
                    {user.level.name}
                  </span>
                )}
              </div>

              <nav className="space-y-2">
                <Link
                  href="/dashboard"
                  className="block px-4 py-2 bg-primary/10 text-primary rounded-lg"
                >
                  个人中心
                </Link>
                <Link
                  href="/orders"
                  className="block px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg"
                >
                  我的订单
                </Link>
                <Link
                  href="/balance"
                  className="block px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg"
                >
                  我的余额
                </Link>
              </nav>
            </div>
          </aside>

          {/* 主内容 */}
          <div className="lg:col-span-3 space-y-6">
            {/* 账户概览 */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="bg-white rounded-xl p-6">
                <p className="text-gray-500 text-sm">账户余额</p>
                <p className="text-2xl font-bold text-primary mt-1">
                  ¥{(user.balance / 100).toFixed(2)}
                </p>
                <Link
                  href="/balance/recharge"
                  className="text-sm text-primary hover:underline mt-2 inline-block"
                >
                  充值 →
                </Link>
              </div>
              <div className="bg-white rounded-xl p-6">
                <p className="text-gray-500 text-sm">累计消费</p>
                <p className="text-2xl font-bold text-gray-800 mt-1">
                  ¥{(user.totalSpent / 100).toFixed(2)}
                </p>
              </div>
              <div className="bg-white rounded-xl p-6">
                <p className="text-gray-500 text-sm">订单数量</p>
                <p className="text-2xl font-bold text-gray-800 mt-1">
                  {user._count.orders}
                </p>
              </div>
            </div>

            {/* 会员等级 */}
            {user.level && (
              <div className="bg-gradient-to-r from-yellow-400 to-orange-500 rounded-xl p-6 text-white">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-white/80 text-sm">当前等级</p>
                    <p className="text-2xl font-bold mt-1">{user.level.name}</p>
                    <p className="text-white/80 text-sm mt-2">
                      享受 {user.level.discount / 10} 折优惠
                    </p>
                  </div>
                  <div className="text-6xl opacity-50">👑</div>
                </div>
              </div>
            )}

            {/* 最近订单 */}
            <div className="bg-white rounded-xl">
              <div className="p-6 border-b flex items-center justify-between">
                <h3 className="font-bold text-gray-800">最近订单</h3>
                <Link href="/orders" className="text-sm text-primary hover:underline">
                  查看全部 →
                </Link>
              </div>
              {recentOrders.length > 0 ? (
                <div className="divide-y">
                  {recentOrders.map((order) => (
                    <div key={order.id} className="p-4 flex items-center justify-between">
                      <div>
                        <p className="font-mono text-sm text-gray-800">{order.orderNo}</p>
                        <p className="text-sm text-gray-500 mt-1">
                          {order.orderNo.startsWith("R")
                            ? "余额充值"
                            : order.items[0]?.product.name
                            ? `${order.items[0]?.product.name}${order.items.length > 1 ? ` 等${order.items.length}件` : ""}`
                            : order.remark || "-"}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="font-bold text-red-500">
                          ¥{(order.payAmount / 100).toFixed(2)}
                        </p>
                        <span
                          className={`text-xs px-2 py-1 rounded-full ${
                            order.status === "DELIVERED" || order.status === "COMPLETED"
                              ? "bg-green-100 text-green-600"
                              : order.status === "PENDING"
                              ? "bg-yellow-100 text-yellow-600"
                              : order.status === "CANCELLED"
                              ? "bg-gray-100 text-gray-600"
                              : order.status === "REFUNDED"
                              ? "bg-red-100 text-red-600"
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
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="p-8 text-center text-gray-500">暂无订单</div>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
