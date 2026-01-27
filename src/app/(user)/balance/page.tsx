import { redirect } from "next/navigation";
import Link from "next/link";
import { auth } from "@/lib/auth";
import prisma from "@/lib/db";

export default async function UserBalancePage() {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    include: {
      balanceLogs: {
        orderBy: { createdAt: "desc" },
        take: 20,
      },
    },
  });

  if (!user) {
    redirect("/login");
  }

  const getTypeInfo = (type: string) => {
    const typeMap: Record<string, { text: string; color: string }> = {
      RECHARGE: { text: "充值", color: "text-green-600" },
      CONSUME: { text: "消费", color: "text-red-600" },
      REFUND: { text: "退款", color: "text-blue-600" },
      ADJUST: { text: "调整", color: "text-purple-600" },
    };
    return typeMap[type] || { text: type, color: "text-gray-600" };
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
                  className="block px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg"
                >
                  我的订单
                </Link>
                <Link
                  href="/balance"
                  className="block px-4 py-2 bg-primary/10 text-primary rounded-lg"
                >
                  我的余额
                </Link>
              </nav>
            </div>
          </aside>

          {/* 主内容 */}
          <div className="lg:col-span-3 space-y-6">
            {/* 余额卡片 */}
            <div className="bg-gradient-to-r from-blue-600 to-purple-600 rounded-xl p-8 text-white">
              <p className="text-white/80 mb-2">账户余额</p>
              <p className="text-4xl font-bold mb-6">
                ¥{(user.balance / 100).toFixed(2)}
              </p>
              <button className="px-6 py-2 bg-white text-primary rounded-lg font-medium hover:bg-white/90">
                立即充值
              </button>
            </div>

            {/* 余额记录 */}
            <div className="bg-white rounded-xl">
              <div className="p-6 border-b">
                <h2 className="text-lg font-bold text-gray-800">余额明细</h2>
              </div>

              {user.balanceLogs.length > 0 ? (
                <div className="divide-y">
                  {user.balanceLogs.map((log) => (
                    <div
                      key={log.id}
                      className="p-4 flex items-center justify-between"
                    >
                      <div>
                        <p className="font-medium text-gray-800">
                          {getTypeInfo(log.type).text}
                        </p>
                        <p className="text-sm text-gray-500">
                          {log.remark || "-"}
                        </p>
                        <p className="text-xs text-gray-400 mt-1">
                          {new Date(log.createdAt).toLocaleString("zh-CN")}
                        </p>
                      </div>
                      <div className="text-right">
                        <p
                          className={`text-lg font-bold ${
                            getTypeInfo(log.type).color
                          }`}
                        >
                          {log.amount > 0 ? "+" : ""}
                          ¥{(log.amount / 100).toFixed(2)}
                        </p>
                        <p className="text-sm text-gray-500">
                          余额: ¥{(log.balance / 100).toFixed(2)}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="p-16 text-center">
                  <div className="text-6xl mb-4">💰</div>
                  <p className="text-gray-500">暂无余额记录</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
