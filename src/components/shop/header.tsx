import Link from "next/link";
import { auth } from "@/lib/auth";

export async function Header() {
  const session = await auth();

  return (
    <header className="bg-white shadow-sm sticky top-0 z-50">
      <div className="container mx-auto px-4">
        <div className="flex items-center justify-between h-16">
          <Link href="/" className="text-xl font-bold text-primary">
            AI Shop
          </Link>
          <nav className="hidden md:flex items-center space-x-6">
            <Link href="/" className="text-gray-600 hover:text-primary">
              首页
            </Link>
            <Link href="/order" className="text-gray-600 hover:text-primary">
              订单查询
            </Link>

            {session?.user ? (
              <>
                <Link href="/dashboard" className="text-gray-600 hover:text-primary">
                  个人中心
                </Link>
                <div className="flex items-center gap-2">
                  <span className="text-gray-600">
                    {session.user.name || session.user.email}
                  </span>
                  <form action="/api/auth/signout" method="POST">
                    <button
                      type="submit"
                      className="text-gray-500 hover:text-red-500 text-sm"
                    >
                      退出
                    </button>
                  </form>
                </div>
              </>
            ) : (
              <>
                <Link href="/login" className="text-gray-600 hover:text-primary">
                  登录
                </Link>
                <Link
                  href="/register"
                  className="bg-primary text-white px-4 py-2 rounded-lg hover:bg-primary/90"
                >
                  注册
                </Link>
              </>
            )}
          </nav>

          {/* 移动端菜单 */}
          <div className="md:hidden flex items-center gap-4">
            <Link
              href={session?.user ? "/dashboard" : "/login"}
              className="text-gray-600 hover:text-primary"
            >
              {session?.user ? "👤" : "登录"}
            </Link>
          </div>
        </div>
      </div>
    </header>
  );
}
