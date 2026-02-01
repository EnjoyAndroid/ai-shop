import Link from "next/link";
import { Suspense } from "react";
import { getCategories, getProducts } from "@/lib/services/product.service";
import { ProductCard } from "@/components/shop/product-card";
import { Announcement } from "@/components/shop/announcement";
import { Header } from "@/components/shop/header";
import { PurchaseSteps } from "@/components/shop/purchase-steps";
import { CopyEmailLink } from "@/components/shop/contact-buttons";

// 强制动态渲染，避免构建时访问数据库
export const dynamic = "force-dynamic";

export default async function HomePage() {
  const [categories, { products }] = await Promise.all([
    getCategories(),
    getProducts({ isActive: true, limit: 12 }),
  ]);

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* 顶部导航 */}
      <Header />

      <main className="container mx-auto px-4 py-8 flex-1">
        {/* 公告 */}
        <Suspense fallback={<div className="mb-6 h-16 bg-gray-100 rounded-lg animate-pulse" />}>
          <Announcement />
        </Suspense>

        {/* Hero 区域 */}
        <section className="bg-gradient-to-r from-blue-600 to-purple-600 rounded-2xl p-8 md:p-12 mb-8 text-white">
          <h1 className="text-3xl md:text-4xl font-bold mb-4">
            AI 服务自助充值平台
          </h1>
          <p className="text-lg md:text-xl opacity-90 mb-6">
            快速、安全、自动发货 - ChatGPT / Claude / Cursor 等热门 AI 工具
          </p>
          <div className="flex flex-wrap gap-4">
            <div className="bg-white/20 backdrop-blur rounded-lg px-4 py-2">
              ✓ 24小时自助购买
            </div>
            <div className="bg-white/20 backdrop-blur rounded-lg px-4 py-2">
              ✓ 支付成功秒发货
            </div>
            <div className="bg-white/20 backdrop-blur rounded-lg px-4 py-2">
              ✓ 售后有保障
            </div>
          </div>
        </section>

        {/* 热门商品 */}
        <section className="mb-12">
          <div className="mb-6">
            <h2 className="text-2xl font-bold text-gray-800">热门商品</h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
            {products.map((product) => (
              <ProductCard key={product.id} product={product} />
            ))}
          </div>
        </section>

        {/* 使用说明 */}
        <section className="bg-white rounded-2xl p-8 mb-8">
          <h2 className="text-2xl font-bold text-gray-800 mb-6 text-center">
            购买流程
          </h2>
          <PurchaseSteps />
        </section>
      </main>

      {/* 页脚 */}
      <footer className="bg-gray-800 text-gray-300 py-8">
        <div className="container mx-auto px-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div>
              <h3 className="text-white font-bold mb-4">AI Shop</h3>
              <p className="text-sm">专业的 AI 服务充值平台</p>
            </div>
            <div className="md:text-right">
              <h3 className="text-white font-bold mb-4">联系我们</h3>
              <ul className="space-y-2 text-sm">
                <li>
                  <a
                    href="https://t.me/ai_pro_labs"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="hover:text-white"
                  >
                    Telegram
                  </a>
                </li>
                <li>
                  <Link href="/help" className="hover:text-white">
                    使用帮助
                  </Link>
                </li>
              </ul>
            </div>
          </div>
          <div className="border-t border-gray-700 mt-8 pt-8 text-center text-sm">
            © 2026 AI Shop. All rights reserved.
          </div>
        </div>
      </footer>
    </div>
  );
}
