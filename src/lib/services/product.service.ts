import prisma from "@/lib/db";
import { encrypt, decrypt } from "@/lib/encryption";
import redis, { CACHE_KEYS } from "@/lib/redis";
import type { Product, Category, CardKey } from "@prisma/client";

export interface ProductWithCategory extends Product {
  category: Category;
  _count?: {
    cardKeys: number;
  };
}

/**
 * 检查是否在构建时（没有真实数据库连接）
 * 只在构建阶段 DATABASE_URL 包含 temp@localhost 时返回 true
 */
function isBuildTime(): boolean {
  const dbUrl = process.env.DATABASE_URL || "";
  return dbUrl.includes("temp@localhost") || dbUrl.includes("temp:temp@");
}

/**
 * 获取所有分类
 */
export async function getCategories(includeInactive = false): Promise<Category[]> {
  if (isBuildTime()) {
    return [];
  }

  try {
    const cacheKey = CACHE_KEYS.CATEGORIES;

    // 尝试从缓存获取
    const cached = await redis.get(cacheKey);
    if (cached && !includeInactive) {
      return JSON.parse(cached);
    }

    const categories = await prisma.category.findMany({
      where: includeInactive ? {} : { isActive: true },
      orderBy: [{ sort: "asc" }, { createdAt: "asc" }],
    });

    // 缓存5分钟
    if (!includeInactive) {
      await redis.set(cacheKey, JSON.stringify(categories), "EX", 300);
    }

    return categories;
  } catch (error) {
    console.error("getCategories error:", error);
    return [];
  }
}

/**
 * 根据 slug 获取分类
 */
export async function getCategoryBySlug(slug: string): Promise<Category | null> {
  if (isBuildTime()) {
    return null;
  }

  try {
    return prisma.category.findUnique({
      where: { slug },
    });
  } catch (error) {
    console.error("getCategoryBySlug error:", error);
    return null;
  }
}

/**
 * 获取商品列表
 */
export async function getProducts(options: {
  categoryId?: string;
  isActive?: boolean;
  page?: number;
  limit?: number;
}): Promise<{ products: ProductWithCategory[]; total: number }> {
  if (isBuildTime()) {
    return { products: [], total: 0 };
  }

  try {
    const { categoryId, isActive = true, page = 1, limit = 20 } = options;

    const where = {
      ...(categoryId && { categoryId }),
      ...(isActive !== undefined && { isActive }),
    };

    const [products, total] = await Promise.all([
      prisma.product.findMany({
        where,
        include: {
          category: true,
          _count: {
            select: {
              cardKeys: {
                where: { status: "AVAILABLE" },
              },
            },
          },
        },
        orderBy: [{ sort: "asc" }, { createdAt: "desc" }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.product.count({ where }),
    ]);

    return { products: products as ProductWithCategory[], total };
  } catch (error) {
    console.error("getProducts error:", error);
    return { products: [], total: 0 };
  }
}

/**
 * 根据 slug 获取商品详情
 */
export async function getProductBySlug(slug: string): Promise<ProductWithCategory | null> {
  if (isBuildTime()) {
    return null;
  }

  try {
    const cacheKey = CACHE_KEYS.PRODUCT(slug);

    // 尝试从缓存获取
    const cached = await redis.get(cacheKey);
    if (cached) {
      return JSON.parse(cached);
    }

    const product = await prisma.product.findUnique({
      where: { slug },
      include: {
        category: true,
        _count: {
          select: {
            cardKeys: {
              where: { status: "AVAILABLE" },
            },
          },
        },
      },
    });

    if (product) {
      // 缓存5分钟
      await redis.set(cacheKey, JSON.stringify(product), "EX", 300);
    }

    return product as ProductWithCategory | null;
  } catch (error) {
    console.error("getProductBySlug error:", error);
    return null;
  }
}

/**
 * 获取商品可用库存数量
 */
export async function getProductStock(productId: string): Promise<number> {
  if (isBuildTime()) {
    return 0;
  }

  try {
    const count = await prisma.cardKey.count({
      where: {
        productId,
        status: "AVAILABLE",
      },
    });
    return count;
  } catch (error) {
    console.error("getProductStock error:", error);
    return 0;
  }
}

/**
 * 批量导入卡密
 */
export async function importCardKeys(
  productId: string,
  cardKeys: string[],
  batchNo?: string
): Promise<number> {
  const data = cardKeys.map((key) => {
    const encrypted = encrypt(key.trim());
    return {
      productId,
      content: encrypted.content,
      iv: encrypted.iv,
      tag: encrypted.tag,
      batchNo,
    };
  });

  const result = await prisma.cardKey.createMany({
    data,
  });

  // 更新商品库存
  await updateProductStock(productId);

  // 清除商品缓存
  const product = await prisma.product.findUnique({
    where: { id: productId },
    select: { slug: true },
  });
  if (product) {
    await redis.del(CACHE_KEYS.PRODUCT(product.slug));
  }

  return result.count;
}

/**
 * 分配卡密给订单
 */
export async function allocateCardKeys(
  productId: string,
  quantity: number,
  orderItemId: string
): Promise<CardKey[]> {
  // 使用分布式锁防止并发分配
  const lockKey = CACHE_KEYS.CARDKEY_LOCK(productId);
  const lockValue = Date.now().toString();

  // 尝试获取锁
  const acquired = await redis.set(lockKey, lockValue, "EX", 30, "NX");
  if (!acquired) {
    throw new Error("系统繁忙，请稍后再试");
  }

  try {
    // 查找可用卡密
    const cardKeys = await prisma.cardKey.findMany({
      where: {
        productId,
        status: "AVAILABLE",
      },
      take: quantity,
      orderBy: { createdAt: "asc" },
    });

    if (cardKeys.length < quantity) {
      throw new Error("库存不足");
    }

    // 更新卡密状态
    await prisma.cardKey.updateMany({
      where: {
        id: { in: cardKeys.map((k) => k.id) },
      },
      data: {
        status: "SOLD",
        orderId: orderItemId,
        soldAt: new Date(),
      },
    });

    // 更新商品库存和销量
    await prisma.product.update({
      where: { id: productId },
      data: {
        stock: { decrement: quantity },
        salesCount: { increment: quantity },
      },
    });

    return cardKeys;
  } finally {
    // 释放锁
    await redis.del(lockKey);
  }
}

/**
 * 解密卡密内容
 */
export function decryptCardKey(cardKey: CardKey): string {
  return decrypt({
    content: cardKey.content,
    iv: cardKey.iv,
    tag: cardKey.tag,
  });
}

/**
 * 更新商品库存数量
 */
async function updateProductStock(productId: string): Promise<void> {
  const count = await prisma.cardKey.count({
    where: {
      productId,
      status: "AVAILABLE",
    },
  });

  await prisma.product.update({
    where: { id: productId },
    data: { stock: count },
  });
}

/**
 * 创建商品
 */
export async function createProduct(data: {
  name: string;
  slug: string;
  description?: string;
  content?: string;
  categoryId: string;
  price: number;
  originalPrice?: number;
  isActive?: boolean;
  sort?: number;
  minQuantity?: number;
  maxQuantity?: number;
}): Promise<Product> {
  const product = await prisma.product.create({
    data: {
      ...data,
      stock: 0,
      salesCount: 0,
    },
  });

  // 清除缓存
  await redis.del(CACHE_KEYS.PRODUCTS_LIST);

  return product;
}

/**
 * 更新商品
 */
export async function updateProduct(
  id: string,
  data: Partial<{
    name: string;
    slug: string;
    description: string;
    content: string;
    categoryId: string;
    price: number;
    originalPrice: number;
    isActive: boolean;
    sort: number;
    minQuantity: number;
    maxQuantity: number;
  }>
): Promise<Product> {
  const product = await prisma.product.update({
    where: { id },
    data,
  });

  // 清除缓存
  await redis.del(CACHE_KEYS.PRODUCT(product.slug));
  await redis.del(CACHE_KEYS.PRODUCTS_LIST);

  return product;
}

/**
 * 删除商品 (软删除)
 */
export async function deleteProduct(id: string): Promise<void> {
  const product = await prisma.product.update({
    where: { id },
    data: { isActive: false },
  });

  // 清除缓存
  await redis.del(CACHE_KEYS.PRODUCT(product.slug));
  await redis.del(CACHE_KEYS.PRODUCTS_LIST);
}
