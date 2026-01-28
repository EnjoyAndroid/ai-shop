import Link from "next/link";
import { getCategories, getProducts } from "@/lib/services/product.service";
import { ProductCard } from "@/components/shop/product-card";
import { CategoryNav } from "@/components/shop/category-nav";

// 强制动态渲染，避免构建时访问数据库
export const dynamic = "force-dynamic";

export const metadata = {
  title: "全部商品 - AI Shop",
  description: "浏览所有 AI 服务商品",
};

export default async function AllProductsPage() {
  const [categories, { products, total }] = await Promise.all([
    getCategories(),
    getProducts({ isActive: true, limit: 100 }),
  ]);

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
              <Link href="/order" className="text-gray-600 hover:text-primary">
                订单查询
              </Link>
            </nav>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        {/* 面包屑 */}
        <nav className="mb-6 text-sm">
          <ol className="flex items-center space-x-2 text-gray-500">
            <li>
              <Link href="/" className="hover:text-primary">
                首页
              </Link>
            </li>
            <li>/</li>
            <li className="text-gray-800">全部商品</li>
          </ol>
        </nav>

        {/* 页面标题 */}
        <div className="bg-white rounded-2xl p-6 mb-8">
          <div className="flex items-center gap-4">
            <span className="text-4xl">🛍️</span>
            <div>
              <h1 className="text-2xl font-bold text-gray-800">全部商品</h1>
              <p className="text-gray-500 mt-1">共 {total} 件商品</p>
            </div>
          </div>
        </div>

        {/* 分类导航 */}
        <CategoryNav categories={categories} />

        {/* 商品列表 */}
        {products.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
            {products.map((product) => (
              <ProductCard key={product.id} product={product} />
            ))}
          </div>
        ) : (
          <div className="text-center py-16">
            <div className="text-6xl mb-4">🔍</div>
            <p className="text-gray-500">暂无商品</p>
          </div>
        )}
      </main>

      {/* 页脚 */}
      <footer className="bg-gray-800 text-gray-300 py-8 mt-12">
        <div className="container mx-auto px-4 text-center text-sm">
          © 2026 AI Shop. All rights reserved.
        </div>
      </footer>
    </div>
  );
}
