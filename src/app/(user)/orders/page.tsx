import { redirect } from "next/navigation";
import Link from "next/link";
import { auth } from "@/lib/auth";
import prisma from "@/lib/db";

// 强制动态渲染，避免构建时访问数据库
export const dynamic = "force-dynamic";

export default async function UserOrdersPage() {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  const orders = await prisma.order.findMany({
    where: { userId: session.user.id },
    orderBy: { createdAt: "desc" },
    include: {
      items: {
        include: {
          product: { select: { name: true, slug: true } },
        },
      },
    },
  });

  const getStatusInfo = (status: string) => {
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
              <Link href="/dashboard" className="text-gray-600 hover:text-primary">
                个人中心
              </Link>
            </nav>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
          {/* 侧边栏 */}
          <aside className="lg:col-span-1">
            <div className="bg-white rounded-xl p-6 sticky top-24">
              <nav className="space-y-2">
                <Link
                  href="/dashboard"
                  className="block px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg"
                >
                  个人中心
                </Link>
                <Link
                  href="/orders"
                  className="block px-4 py-2 bg-primary/10 text-primary rounded-lg"
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
          <div className="lg:col-span-3">
            <div className="bg-white rounded-xl">
              <div className="p-6 border-b">
                <h1 className="text-xl font-bold text-gray-800">我的订单</h1>
              </div>

              {orders.length > 0 ? (
                <div className="divide-y">
                  {orders.map((order) => (
                    <div key={order.id} className="p-6">
                      {/* 订单头部 */}
                      <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-4">
                          <span className="font-mono text-sm text-gray-500">
                            {order.orderNo}
                          </span>
                          <span className="text-sm text-gray-400">
                            {new Date(order.createdAt).toLocaleString("zh-CN")}
                          </span>
                        </div>
                        <span
                          className={`px-3 py-1 text-xs rounded-full ${
                            getStatusInfo(order.status).color
                          }`}
                        >
                          {getStatusInfo(order.status).text}
                        </span>
                      </div>

                      {/* 商品列表 */}
                      <div className="space-y-3 mb-4">
                        {order.items.map((item) => (
                          <div
                            key={item.id}
                            className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
                          >
                            <div className="flex items-center gap-3">
                              <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-purple-600 rounded-lg flex items-center justify-center">
                                <span className="text-white text-lg">🤖</span>
                              </div>
                              <div>
                                <p className="font-medium text-gray-800">
                                  {item.productName}
                                </p>
                                <p className="text-sm text-gray-500">
                                  ¥{(item.price / 100).toFixed(2)} × {item.quantity}
                                </p>
                              </div>
                            </div>
                            <p className="font-bold text-red-500">
                              ¥{((item.price * item.quantity) / 100).toFixed(2)}
                            </p>
                          </div>
                        ))}
                      </div>

                      {/* 订单底部 */}
                      <div className="flex items-center justify-between pt-4 border-t">
                        <div className="text-sm text-gray-500">
                          共 {order.items.reduce((sum, item) => sum + item.quantity, 0)} 件商品
                        </div>
                        <div className="flex items-center gap-4">
                          <span className="text-gray-600">
                            实付：
                            <span className="text-xl font-bold text-red-500">
                              ¥{(order.payAmount / 100).toFixed(2)}
                            </span>
                          </span>
                          <Link
                            href={`/order/${order.orderNo}?password=${order.queryPassword}`}
                            className="px-4 py-2 bg-primary text-white rounded-lg text-sm hover:bg-primary/90"
                          >
                            查看详情
                          </Link>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="p-16 text-center">
                  <div className="text-6xl mb-4">📦</div>
                  <p className="text-gray-500 mb-4">暂无订单</p>
                  <Link
                    href="/"
                    className="inline-block px-6 py-2 bg-primary text-white rounded-lg hover:bg-primary/90"
                  >
                    去购物
                  </Link>
                </div>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
