import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { categorySchema } from "@/lib/validations";
import { getAdminSession } from "@/lib/admin-auth";
import { logError } from "@/lib/logger";

// 获取所有分类
export async function GET() {
  const admin = await getAdminSession();
  if (!admin) {
    return NextResponse.json({ error: "未授权" }, { status: 401 });
  }

  try {
    const categories = await prisma.category.findMany({
      orderBy: [{ sort: "asc" }, { createdAt: "asc" }],
      include: {
        _count: {
          select: { products: true },
        },
      },
    });

    return NextResponse.json({ categories });
  } catch (error) {
    logError("Get categories", error);
    return NextResponse.json(
      { error: "获取分类失败" },
      { status: 500 }
    );
  }
}

// 创建分类
export async function POST(request: NextRequest) {
  const admin = await getAdminSession();
  if (!admin) {
    return NextResponse.json({ error: "未授权" }, { status: 401 });
  }

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

    // 检查 slug 是否已存在
    const existing = await prisma.category.findUnique({
      where: { slug },
    });
    if (existing) {
      return NextResponse.json(
        { error: "Slug 已存在" },
        { status: 400 }
      );
    }

    const category = await prisma.category.create({
      data: {
        name,
        slug,
        description,
        icon,
        sort,
        isActive,
      },
    });

    return NextResponse.json({ category });
  } catch (error) {
    logError("Create category", error);
    return NextResponse.json(
      { error: "创建分类失败" },
      { status: 500 }
    );
  }
}
