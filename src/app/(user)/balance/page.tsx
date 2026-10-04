import { redirect } from "next/navigation";
import Link from "next/link";
import { auth } from "@/lib/auth";
import prisma from "@/lib/db";
import { Metadata } from "next";

export const metadata: Metadata = {
  title: "我的余额",
};

// 强制动态渲染，避免构建时访问数据库
export const dynamic = "force-dynamic";

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
    <div className="space-y-6">
            {/* 余额卡片 */}
            <div className="bg-gradient-to-r from-blue-600 to-purple-600 rounded-xl p-8 text-white">
              <p className="text-white/80 mb-2">账户余额</p>
              <p className="text-4xl font-bold mb-6">
                ¥{(user.balance / 100).toFixed(2)}
              </p>
              <Link
                href="/balance/recharge"
                className="px-6 py-2 bg-white text-primary rounded-lg font-medium hover:bg-white/90 inline-block"
              >
                立即充值
              </Link>
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
  );
}
