"use client";

import Link from "next/link";
import type { Product, Category } from "@prisma/client";

interface ProductWithCategory extends Product {
  category: Category;
  _count?: {
    cardKeys: number;
  };
}

interface ProductCardProps {
  product: ProductWithCategory;
}

export function ProductCard({ product }: ProductCardProps) {
  const stock = product._count?.cardKeys ?? product.stock;
  const hasStock = stock > 0;

  return (
    <Link href={`/product/${product.slug}`} target="_blank" className="block h-full min-w-0">
      <div className="flex h-full flex-col bg-white rounded-xl shadow-sm hover:shadow-md transition-shadow overflow-hidden group">
        {/* 商品图片区域 */}
        {product.image ? (
          <div className="aspect-square overflow-hidden">
            <img
              src={product.image}
              alt={product.name}
              className="w-full h-full object-contain bg-gray-50 group-hover:scale-105 transition-transform"
            />
          </div>
        ) : (
          <div className="aspect-square bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center">
            <span className="text-4xl text-white opacity-80">
              {product.category.icon || "🤖"}
            </span>
          </div>
        )}

        {/* 商品信息 */}
        <div className="flex flex-1 flex-col p-4">
          <div className="flex items-center justify-between mb-2">
            <h3 title={product.name} className="min-w-0 flex-1 truncate font-semibold text-gray-800 group-hover:text-primary transition-colors">
              {product.name}
            </h3>
            <span className="shrink-0 text-xs bg-gray-100 text-gray-500 px-2 py-1 rounded-full whitespace-nowrap ml-2">
              {product.category.name}
            </span>
          </div>

          <p className="mb-3 h-10 text-sm leading-5 text-gray-500 line-clamp-2" title={product.description || undefined}>
            {product.description || "\u00a0"}
          </p>

          <div className="mt-auto flex items-center justify-between">
            <div className="flex items-baseline gap-2">
              <span className="text-xl font-bold text-red-500">
                ¥{(product.price / 100).toFixed(2)}
              </span>
              {product.originalPrice && product.originalPrice > product.price && (
                <span className="text-sm text-gray-400 line-through">
                  ¥{(product.originalPrice / 100).toFixed(2)}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2 text-xs text-gray-500">
              <span
                className={`px-2 py-1 rounded-full ${
                  hasStock
                    ? "bg-green-100 text-green-600"
                    : "bg-red-100 text-red-600"
                }`}
              >
                {hasStock ? `库存 ${stock}` : "售罄"}
              </span>
              <span>已售 {product.salesCount || 0}</span>
            </div>
          </div>
        </div>
      </div>
    </Link>
  );
}
