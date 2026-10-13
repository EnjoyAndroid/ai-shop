"use client";

import { useState } from "react";
import Link from "next/link";
import { useSession, signOut } from "next-auth/react";
import { Github } from "lucide-react";
import { GITHUB_URL } from "@/lib/public-config";

interface HeaderClientProps {
  isLoggedIn?: boolean;
}

export function HeaderClient({ isLoggedIn: propIsLoggedIn }: HeaderClientProps = {}) {
  const { data: session } = useSession();
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  // 使用 props 或 session 数据
  const isLoggedIn = propIsLoggedIn ?? !!session?.user;

  const toggleMenu = () => setIsMenuOpen(!isMenuOpen);
  const closeMenu = () => setIsMenuOpen(false);

  return (
    <>
      {/* 完整的 Header（当作为独立组件使用时） */}
      {propIsLoggedIn === undefined && (
        <header className="bg-white shadow-sm sticky top-0 z-50">
          <div className="container mx-auto px-4">
            <div className="flex items-center justify-between h-16">
              <Link href="/" className="text-2xl font-bold text-blue-600">
                AI Shop
              </Link>
              <div className="hidden md:flex items-center gap-6">
              <nav className="flex items-center gap-6 text-base leading-6" aria-label="商城导航">
                <Link href="/" className="inline-flex h-10 items-center text-gray-600 hover:text-primary">
                  首页
                </Link>
                <Link href="/order" className="inline-flex h-10 items-center text-gray-600 hover:text-primary">
                  订单查询
                </Link>

                {isLoggedIn ? (
                  <>
                    <Link href="/dashboard" className="inline-flex h-10 items-center text-gray-600 hover:text-primary">
                      个人中心
                    </Link>
                    <button
                        onClick={() => signOut({ callbackUrl: "/" })}
                        className="inline-flex h-10 items-center text-base leading-6 text-gray-500 hover:text-red-500"
                      >
                        退出
                    </button>
                  </>
                ) : (
                  <>
                    <Link href="/login" className="inline-flex h-10 items-center text-gray-600 hover:text-primary">
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
              <div className="flex items-center border-l border-gray-200 pl-5">
                <a href={GITHUB_URL} target="_blank" rel="noopener noreferrer" title="查看项目源码"
                  className="flex items-center gap-2 text-base leading-6 text-gray-500 transition-colors hover:text-gray-900">
                  <Github className="h-4 w-4" aria-hidden="true" />
                  <span>Github</span>
                </a>
              </div>
              </div>

              {/* 移动端汉堡菜单按钮 */}
              <button
                onClick={toggleMenu}
                className="md:hidden flex flex-col justify-center items-center w-10 h-10 rounded-lg hover:bg-gray-100"
                aria-label="菜单"
              >
                <span className={`block w-5 h-0.5 bg-gray-600 transition-all duration-300 ${isMenuOpen ? "rotate-45 translate-y-1.5" : ""}`} />
                <span className={`block w-5 h-0.5 bg-gray-600 mt-1 transition-all duration-300 ${isMenuOpen ? "opacity-0" : ""}`} />
                <span className={`block w-5 h-0.5 bg-gray-600 mt-1 transition-all duration-300 ${isMenuOpen ? "-rotate-45 -translate-y-1.5" : ""}`} />
              </button>
            </div>
          </div>
        </header>
      )}

      {/* 仅移动端菜单按钮（当嵌入到 Header 服务端组件时） */}
      {propIsLoggedIn !== undefined && (
        <button
          onClick={toggleMenu}
          className="md:hidden flex flex-col justify-center items-center w-10 h-10 rounded-lg hover:bg-gray-100"
          aria-label="菜单"
        >
          <span className={`block w-5 h-0.5 bg-gray-600 transition-all duration-300 ${isMenuOpen ? "rotate-45 translate-y-1.5" : ""}`} />
          <span className={`block w-5 h-0.5 bg-gray-600 mt-1 transition-all duration-300 ${isMenuOpen ? "opacity-0" : ""}`} />
          <span className={`block w-5 h-0.5 bg-gray-600 mt-1 transition-all duration-300 ${isMenuOpen ? "-rotate-45 -translate-y-1.5" : ""}`} />
        </button>
      )}

      {/* 移动端抽屉菜单遮罩 */}
      {isMenuOpen && (
        <div
          className="md:hidden fixed inset-0 bg-black/50 z-40"
          onClick={closeMenu}
        />
      )}

      {/* 移动端抽屉菜单 */}
      <div
        className={`md:hidden fixed top-0 right-0 h-full w-64 bg-white shadow-xl z-50 transform transition-transform duration-300 ease-in-out ${
          isMenuOpen ? "translate-x-0" : "translate-x-full"
        }`}
      >
        <div className="flex flex-col h-full">
          {/* 菜单头部 */}
          <div className="flex items-center justify-between p-4 border-b">
            <span className="text-lg font-bold text-blue-600">菜单</span>
            <button
              onClick={closeMenu}
              className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100"
              aria-label="关闭菜单"
            >
              <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* 导航链接 */}
          <nav className="flex-1 p-4 space-y-2">
            <Link
              href="/"
              onClick={closeMenu}
              className="flex items-center gap-3 px-4 py-3 text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
              </svg>
              <span>首页</span>
            </Link>

            <Link
              href="/order"
              onClick={closeMenu}
              className="flex items-center gap-3 px-4 py-3 text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
              </svg>
              <span>订单查询</span>
            </Link>


            {isLoggedIn ? (
              <>
                <Link
                  href="/dashboard"
                  onClick={closeMenu}
                  className="flex items-center gap-3 px-4 py-3 text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                  </svg>
                  <span>个人中心</span>
                </Link>

                <Link
                  href="/orders"
                  onClick={closeMenu}
                  className="flex items-center gap-3 px-4 py-3 text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                  </svg>
                  <span>我的订单</span>
                </Link>

                <Link
                  href="/balance"
                  onClick={closeMenu}
                  className="flex items-center gap-3 px-4 py-3 text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
                  </svg>
                  <span>我的余额</span>
                </Link>
              </>
            ) : (
              <>
                <Link
                  href="/login"
                  onClick={closeMenu}
                  className="flex items-center gap-3 px-4 py-3 text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h7a3 3 0 013 3v1" />
                  </svg>
                  <span>登录</span>
                </Link>

                <Link
                  href="/register"
                  onClick={closeMenu}
                  className="flex items-center gap-3 px-4 py-3 text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
                  </svg>
                  <span>注册</span>
                </Link>
              </>
            )}
          </nav>

          {/* 项目链接与账号操作 */}
          <div className="p-4 border-t space-y-2">
            <a href={GITHUB_URL} target="_blank" rel="noopener noreferrer" onClick={closeMenu}
              className="flex items-center justify-between rounded-lg px-4 py-3 text-sm text-gray-500 transition-colors hover:bg-gray-50 hover:text-gray-900">
              <span className="flex items-center gap-2"><Github className="h-4 w-4" aria-hidden="true" />Github</span>
              <span className="text-xs text-gray-400">项目源码 ↗</span>
            </a>
            {isLoggedIn && (
              <button
                onClick={() => {
                  closeMenu();
                  signOut({ callbackUrl: "/" });
                }}
                className="flex items-center justify-center gap-2 w-full px-4 py-3 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                </svg>
                <span>退出登录</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
