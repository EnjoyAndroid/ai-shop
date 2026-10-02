import { logError } from "@/lib/logger";
import prisma from "@/lib/db";
import { encrypt, decrypt } from "@/lib/encryption";
import redis, { CACHE_KEYS } from "@/lib/redis";
import type { Prisma, Product, Category, CardKey } from "@prisma/client";

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
    logError("getCategories error", error);
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
    logError("getCategoryBySlug error", error);
    return null;
  }
}

/**
 * 获取商品列表（带缓存）
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

    // 构建缓存键（仅对首页默认查询启用缓存）
    const isDefaultQuery = !categoryId && isActive === true && page === 1 && limit === 20;
    const cacheKey = isDefaultQuery ? CACHE_KEYS.PRODUCTS_LIST : null;

    // 尝试从缓存获取
    if (cacheKey) {
      const cached = await redis.get(cacheKey);
      if (cached) {
        return JSON.parse(cached);
      }
    }

    const where = {
      ...(categoryId && { categoryId }),
      ...(isActive !== undefined && { isActive }),
      // 过滤掉已禁用分类下的商品
      category: {
        isActive: true,
      },
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

    const result = { products: products as ProductWithCategory[], total };

    // 缓存首页商品列表 5 分钟
    if (cacheKey) {
      await redis.set(cacheKey, JSON.stringify(result), "EX", 300);
    }

    return result;
  } catch (error) {
    logError("getProducts error", error);
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
    logError("getProductBySlug error", error);
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
    logError("getProductStock error", error);
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
 * 分配卡密给订单（支付成功时，将 LOCKED 状态转为 SOLD）
 */
export async function allocateCardKeys(
  productId: string,
  quantity: number,
  orderItemId: string,
  tx: Prisma.TransactionClient
): Promise<CardKey[]> {
  const owned = await tx.cardKey.findMany({ where: { productId, orderId: orderItemId, status: { in: ["LOCKED", "SOLD"] } } });
  if (owned.length === quantity && owned.every(key => key.status === "SOLD")) return owned;
  if (owned.some(key => key.status === "SOLD")) throw new Error("订单卡密状态异常，请人工核对");
  let cards = owned;
  if (cards.length === 0) {
    // 兼容历史已付款但没有预留库存的订单。
    const ids = await tx.$queryRaw<{ id: string }[]>`
      SELECT id FROM "CardKey" WHERE "productId" = ${productId} AND status = 'AVAILABLE'
      ORDER BY "createdAt", id LIMIT ${quantity} FOR UPDATE SKIP LOCKED`;
    cards = await tx.cardKey.findMany({ where: { id: { in: ids.map(key => key.id) } } });
  }
  if (cards.length !== quantity) throw new Error("库存不足");
  const updated = await tx.cardKey.updateMany({
    where: { id: { in: cards.map(key => key.id) }, OR: [{ status: "AVAILABLE", orderId: null }, { status: "LOCKED", orderId: orderItemId }] },
    data: { status: "SOLD", orderId: orderItemId, soldAt: new Date() },
  });
  if (updated.count !== quantity) throw new Error("库存已被占用，请重试");
  const stock = await tx.cardKey.count({ where: { productId, status: "AVAILABLE" } });
  await tx.product.update({ where: { id: productId }, data: { stock, salesCount: { increment: quantity } } });
  return tx.cardKey.findMany({ where: { orderId: orderItemId, status: "SOLD" } });
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
