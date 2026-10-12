import Link from "next/link";
import { Github } from "lucide-react";
import { auth } from "@/lib/auth";
import { LogoutButton } from "./logout-button";
import { HeaderClient } from "./header-client";
import { GITHUB_URL } from "@/lib/public-config";

export async function Header() {
  const session = await auth();

  return (
    <header className="bg-white shadow-sm sticky top-0 z-50">
      <div className="container mx-auto px-4">
        <div className="flex items-center justify-between h-16">
          <Link href="/" className="text-2xl font-bold text-blue-600">
            AI Shop
          </Link>
          <div className="hidden md:flex items-center gap-6">
          <nav className="flex items-center gap-6" aria-label="商城导航">
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
                <LogoutButton />
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
          <div className="border-l border-gray-200 pl-5">
            <a href={GITHUB_URL} target="_blank" rel="noopener noreferrer" title="查看项目源码"
              className="inline-flex items-center gap-2 text-sm text-gray-500 transition-colors hover:text-gray-900">
              <Github className="h-4 w-4" aria-hidden="true" />
              <span>Github</span>
            </a>
          </div>
          </div>

          {/* 移动端菜单 */}
          <HeaderClient isLoggedIn={!!session?.user} />
        </div>
      </div>
    </header>
  );
}
