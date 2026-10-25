import { getSettings } from "@/lib/services/settings.service";
import { getPublicContactSettings } from "@/lib/contact-settings";
import Link from "next/link";
import { Suspense } from "react";
import { getCategories, getProducts } from "@/lib/services/product.service";
import { ProductCard } from "@/components/shop/product-card";
import { Announcement } from "@/components/shop/announcement";
import { Header } from "@/components/shop/header";
import { CommunityEntry } from "@/components/shop/community-entry";
import { WechatSupport } from "@/components/shop/wechat-support";

// 强制动态渲染，避免构建时访问数据库
export const dynamic = "force-dynamic";

export default async function HomePage() {
  const [categories, { products }, savedSettings] = await Promise.all([
    getCategories(),
    getProducts({ isActive: true, limit: 12 }),
    getSettings(),
  ]);
  const { telegramUrl, wechatSupportText, wechatSupportQrUrl } = getPublicContactSettings(savedSettings);

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

        <div className="mb-8">
          <CommunityEntry />
        </div>

      </main>

      {/* 页脚 */}
      <footer className="bg-gray-50 text-slate-500">
        <div className="container mx-auto px-4">
          <div className="border-t border-slate-200/70 py-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <span className="text-sm font-semibold text-slate-700">AI Shop</span>
                <span className="text-xs">专业的 AI 服务充值平台</span>
              </div>
              {(wechatSupportText || wechatSupportQrUrl || telegramUrl) && <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs">
                {(wechatSupportText || wechatSupportQrUrl) && <WechatSupport text={wechatSupportText} qrUrl={wechatSupportQrUrl} className="transition-colors hover:text-primary" />}
                {telegramUrl && <a href={telegramUrl} target="_blank" rel="noopener noreferrer" className="transition-colors hover:text-primary">Telegram</a>}
              </div>}
            </div>
            <p className="mt-3 text-xs">© 2026 AI Shop. All rights reserved.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
