import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import redis, { CACHE_KEYS } from "@/lib/redis";
import { categorySchema } from "@/lib/validations";

// 更新分类
export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const body = await request.json();

    const validationResult = categorySchema.safeParse(body);
    if (!validationResult.success) {
      return NextResponse.json(
        { error: validationResult.error.errors[0].message },
        { status: 400 }
      );
    }

    const { name, slug, description, icon, sort, isActive } = validationResult.data;

    // 检查分类是否存在
    const existing = await prisma.category.findUnique({
      where: { id: params.id },
    });
    if (!existing) {
      return NextResponse.json(
        { error: "分类不存在" },
        { status: 404 }
      );
    }

    // 检查 slug 是否被其他分类使用
    if (slug !== existing.slug) {
      const slugExists = await prisma.category.findUnique({
        where: { slug },
      });
      if (slugExists) {
        return NextResponse.json(
          { error: "Slug 已被使用" },
          { status: 400 }
        );
      }
    }

    const category = await prisma.category.update({
      where: { id: params.id },
      data: {
        name,
        slug,
        description,
        icon,
        sort,
        isActive,
      },
    });

    // 清除分类缓存
    await redis.del(CACHE_KEYS.CATEGORIES);

    return NextResponse.json({ category });
  } catch (error) {
    console.error("Update category error:", error);
    return NextResponse.json(
      { error: "更新分类失败" },
      { status: 500 }
    );
  }
}

// 删除分类
export async function DELETE(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    // 检查分类下是否有商品
    const category = await prisma.category.findUnique({
      where: { id: params.id },
      include: {
        _count: { select: { products: true } },
      },
    });

    if (!category) {
      return NextResponse.json(
        { error: "分类不存在" },
        { status: 404 }
      );
    }

    if (category._count.products > 0) {
      return NextResponse.json(
        { error: "该分类下有商品，无法删除" },
        { status: 400 }
      );
    }

    await prisma.category.delete({
      where: { id: params.id },
    });

    // 清除分类缓存
    await redis.del(CACHE_KEYS.CATEGORIES);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Delete category error:", error);
    return NextResponse.json(
      { error: "删除分类失败" },
      { status: 500 }
    );
  }
}
