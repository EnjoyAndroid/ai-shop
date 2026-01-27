"use client";

import Link from "next/link";
import type { Category } from "@prisma/client";

interface CategoryNavProps {
  categories: Category[];
  activeSlug?: string;
}

export function CategoryNav({ categories, activeSlug }: CategoryNavProps) {
  return (
    <section className="mb-8">
      <div className="flex flex-wrap gap-3">
        <Link
          href="/"
          className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${
            !activeSlug
              ? "bg-primary text-white"
              : "bg-white text-gray-600 hover:bg-gray-100"
          }`}
        >
          全部
        </Link>
        {categories.map((category) => (
          <Link
            key={category.id}
            href={`/category/${category.slug}`}
            className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${
              activeSlug === category.slug
                ? "bg-primary text-white"
                : "bg-white text-gray-600 hover:bg-gray-100"
            }`}
          >
            {category.icon && <span className="mr-1">{category.icon}</span>}
            {category.name}
          </Link>
        ))}
      </div>
    </section>
  );
}
