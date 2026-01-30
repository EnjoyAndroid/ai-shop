import { notFound } from "next/navigation";
import Link from "next/link";
import { getProductBySlug, getCategories } from "@/lib/services/product.service";
import { BuyNowButton } from "@/components/shop/buy-now-button";
import { Header } from "@/components/shop/header";

// 强制动态渲染，避免构建时访问数据库
export const dynamic = "force-dynamic";

interface ProductPageProps {
  params: { slug: string };
}

export async function generateMetadata({ params }: ProductPageProps) {
  const product = await getProductBySlug(params.slug);
  if (!product) return { title: "商品不存在" };

  return {
    title: product.name,
    description: product.description,
  };
}

export default async function ProductPage({ params }: ProductPageProps) {
  const product = await getProductBySlug(params.slug);

  if (!product) {
    notFound();
  }

  const stock = product._count?.cardKeys ?? product.stock;
  const hasStock = stock > 0;

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
            <li>
              <Link
                href={`/category/${product.category.slug}`}
                className="hover:text-primary"
              >
                {product.category.name}
              </Link>
            </li>
            <li>/</li>
            <li className="text-gray-800">{product.name}</li>
          </ol>
        </nav>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* 商品图片 */}
          <div className="bg-gradient-to-br from-blue-500 to-purple-600 rounded-2xl aspect-square flex items-center justify-center">
            <span className="text-9xl text-white opacity-80">
              {product.category.icon || "🤖"}
            </span>
          </div>

          {/* 商品信息 */}
          <div className="bg-white rounded-2xl p-8">
            <div className="mb-4">
              <span className="text-sm bg-gray-100 text-gray-500 px-3 py-1 rounded-full">
                {product.category.name}
              </span>
            </div>

            <h1 className="text-3xl font-bold text-gray-800 mb-4">
              {product.name}
            </h1>

            {product.description && (
              <p className="text-gray-600 mb-6">{product.description}</p>
            )}

            {/* 价格 */}
            <div className="mb-6">
              <div className="flex items-baseline gap-3">
                <span className="text-4xl font-bold text-red-500">
                  ¥{(product.price / 100).toFixed(2)}
                </span>
                {product.originalPrice && product.originalPrice > product.price && (
                  <span className="text-xl text-gray-400 line-through">
                    ¥{(product.originalPrice / 100).toFixed(2)}
                  </span>
                )}
              </div>
              <p className="text-sm text-gray-500 mt-2">
                会员可享更多折扣
              </p>
            </div>

            {/* 库存 */}
            <div className="mb-6 flex items-center gap-4">
              <span className="text-gray-600">库存:</span>
              <span
                className={`px-3 py-1 rounded-full text-sm ${
                  hasStock
                    ? "bg-green-100 text-green-600"
                    : "bg-red-100 text-red-600"
                }`}
              >
                {hasStock ? `${stock} 件` : "售罄"}
              </span>
              <span className="text-gray-500 text-sm">
                已售 {product.salesCount} 件
              </span>
            </div>

            {/* 购买限制 */}
            <div className="mb-6 text-sm text-gray-500">
              单次购买: {product.minQuantity} - {product.maxQuantity} 件
            </div>

            {/* 立即购买 */}
            <BuyNowButton
              product={{
                productId: product.id,
                productName: product.name,
                price: product.price,
                maxQuantity: product.maxQuantity,
                minQuantity: product.minQuantity,
              }}
              disabled={!hasStock}
            />
          </div>
        </div>

        {/* 商品详情 */}
        {product.content && (
          <div className="mt-8 bg-white rounded-2xl p-8">
            <h2 className="text-2xl font-bold text-gray-800 mb-6">商品详情</h2>
            <div className="prose max-w-none text-gray-600 leading-relaxed whitespace-pre-wrap">
              {product.content}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
