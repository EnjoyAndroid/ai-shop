import Link from "next/link";
import { notFound } from "next/navigation";
import { getCategoryBySlug, getCategories, getProducts } from "@/lib/services/product.service";
import { ProductCard } from "@/components/shop/product-card";
import { CategoryNav } from "@/components/shop/category-nav";
import { Header } from "@/components/shop/header";

// 强制动态渲染，避免构建时访问数据库
export const dynamic = "force-dynamic";

interface CategoryPageProps {
  params: { slug: string };
}

export async function generateMetadata({ params }: CategoryPageProps) {
  const category = await getCategoryBySlug(params.slug);
  if (!category) return { title: "分类不存在" };

  return {
    title: category.name,
    description: category.description,
  };
}

export default async function CategoryPage({ params }: CategoryPageProps) {
  const category = await getCategoryBySlug(params.slug);

  if (!category) {
    notFound();
  }

  const [categories, { products, total }] = await Promise.all([
    getCategories(),
    getProducts({ categoryId: category.id, isActive: true }),
  ]);

  return (
    <div className="min-h-screen bg-gray-50">
      <Header />

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
            <li className="text-gray-800">{category.name}</li>
          </ol>
        </nav>

        {/* 分类信息 */}
        <div className="bg-white rounded-2xl p-6 mb-8">
          <div className="flex items-center gap-4">
            <span className="text-4xl">{category.icon || "📁"}</span>
            <div>
              <h1 className="text-2xl font-bold text-gray-800">{category.name}</h1>
              {category.description && (
                <p className="text-gray-500 mt-1">{category.description}</p>
              )}
            </div>
          </div>
        </div>

        {/* 分类导航 */}
        <CategoryNav categories={categories} activeSlug={params.slug} />

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
            <p className="text-gray-500">该分类暂无商品</p>
          </div>
        )}

        {/* 商品数量 */}
        <div className="mt-8 text-center text-sm text-gray-500">
          共 {total} 件商品
        </div>
      </main>
    </div>
  );
}
