import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import redis, { CACHE_KEYS } from "@/lib/redis";
import { productSchema } from "@/lib/validations";
import { getAdminSession } from "@/lib/admin-auth";
import { logError } from "@/lib/logger";

// 获取单个商品
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await getAdminSession();
  if (!admin) {
    return NextResponse.json({ error: "未授权" }, { status: 401 });
  }

  try {
    const product = await prisma.product.findUnique({
      where: { id: (await params).id },
      include: {
        category: true,
        _count: {
          select: {
            cardKeys: { where: { status: "AVAILABLE" } },
          },
        },
      },
    });

    if (!product) {
      return NextResponse.json(
        { error: "商品不存在" },
        { status: 404 }
      );
    }

    return NextResponse.json({ product });
  } catch (error) {
    logError("Get product", error);
    return NextResponse.json(
      { error: "获取商品失败" },
      { status: 500 }
    );
  }
}

// 更新商品
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await getAdminSession();
  if (!admin) {
    return NextResponse.json({ error: "未授权" }, { status: 401 });
  }

  try {
    const body = await request.json();

    const validationResult = productSchema.safeParse(body);
    if (!validationResult.success) {
      return NextResponse.json(
        { error: validationResult.error.issues[0].message },
        { status: 400 }
      );
    }

    const data = validationResult.data;

    // 检查商品是否存在
    const existing = await prisma.product.findUnique({
      where: { id: (await params).id },
    });
    if (!existing) {
      return NextResponse.json(
        { error: "商品不存在" },
        { status: 404 }
      );
    }

    // 检查 slug 是否被其他商品使用
    if (data.slug !== existing.slug) {
      const slugExists = await prisma.product.findUnique({
        where: { slug: data.slug },
      });
      if (slugExists) {
        return NextResponse.json(
          { error: "Slug 已被使用" },
          { status: 400 }
        );
      }
    }

    const product = await prisma.product.update({
      where: { id: (await params).id },
      data: {
        name: data.name,
        slug: data.slug,
        description: data.description,
        content: data.content,
        image: data.image,
        categoryId: data.categoryId,
        price: data.price,
        originalPrice: data.originalPrice,
        sort: data.sort,
        minQuantity: data.minQuantity,
        maxQuantity: data.maxQuantity,
        isActive: data.isActive,
      },
    });

    // 清除商品缓存
    await redis.del(CACHE_KEYS.PRODUCT(existing.slug));
    if (data.slug !== existing.slug) {
      await redis.del(CACHE_KEYS.PRODUCT(data.slug));
    }
    // 清除商品列表缓存
    const keys = await redis.keys("products:*");
    if (keys.length > 0) {
      await redis.del(...keys);
    }

    return NextResponse.json({ product });
  } catch (error) {
    logError("Update product", error);
    return NextResponse.json(
      { error: "更新商品失败" },
      { status: 500 }
    );
  }
}

// 删除商品
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await getAdminSession();
  if (!admin) {
    return NextResponse.json({ error: "未授权" }, { status: 401 });
  }

  try {
    // 检查商品是否存在
    const product = await prisma.product.findUnique({
      where: { id: (await params).id },
      include: {
        _count: {
          select: {
            cardKeys: true,
            orderItems: true,
          },
        },
      },
    });

    if (!product) {
      return NextResponse.json(
        { error: "商品不存在" },
        { status: 404 }
      );
    }

    // 检查是否有订单关联
    if (product._count.orderItems > 0) {
      return NextResponse.json(
        { error: "该商品有关联订单，无法删除" },
        { status: 400 }
      );
    }

    // 删除关联的卡密
    await prisma.cardKey.deleteMany({
      where: { productId: (await params).id },
    });

    // 删除商品
    await prisma.product.delete({
      where: { id: (await params).id },
    });

    // 清除商品缓存
    await redis.del(CACHE_KEYS.PRODUCT(product.slug));
    // 清除商品列表缓存
    const keys = await redis.keys("products:*");
    if (keys.length > 0) {
      await redis.del(...keys);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    logError("Delete product", error);
    return NextResponse.json(
      { error: "删除商品失败" },
      { status: 500 }
    );
  }
}
