import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { productSchema } from "@/lib/validations";

// 获取所有商品
export async function GET() {
  try {
    const products = await prisma.product.findMany({
      orderBy: [{ sort: "asc" }, { createdAt: "desc" }],
      include: {
        category: true,
        _count: {
          select: {
            cardKeys: { where: { status: "AVAILABLE" } },
          },
        },
      },
    });

    return NextResponse.json({ products });
  } catch (error) {
    console.error("Get products error:", error);
    return NextResponse.json(
      { error: "获取商品失败" },
      { status: 500 }
    );
  }
}

// 创建商品
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const validationResult = productSchema.safeParse(body);
    if (!validationResult.success) {
      return NextResponse.json(
        { error: validationResult.error.errors[0].message },
        { status: 400 }
      );
    }

    const data = validationResult.data;

    // 检查 slug 是否已存在
    const existing = await prisma.product.findUnique({
      where: { slug: data.slug },
    });
    if (existing) {
      return NextResponse.json(
        { error: "Slug 已存在" },
        { status: 400 }
      );
    }

    // 检查分类是否存在
    const category = await prisma.category.findUnique({
      where: { id: data.categoryId },
    });
    if (!category) {
      return NextResponse.json(
        { error: "分类不存在" },
        { status: 400 }
      );
    }

    const product = await prisma.product.create({
      data: {
        ...data,
        stock: 0,
        salesCount: 0,
      },
    });

    return NextResponse.json({ product });
  } catch (error) {
    console.error("Create product error:", error);
    return NextResponse.json(
      { error: "创建商品失败" },
      { status: 500 }
    );
  }
}
