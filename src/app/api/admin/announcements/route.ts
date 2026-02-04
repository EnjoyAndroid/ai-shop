import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { getAdminSession } from "@/lib/admin-auth";
import { logError } from "@/lib/logger";

export const dynamic = "force-dynamic";

// 获取公告列表
export async function GET() {
  const admin = await getAdminSession();
  if (!admin) {
    return NextResponse.json({ error: "未授权" }, { status: 401 });
  }

  try {
    const announcements = await prisma.announcement.findMany({
      orderBy: [{ isPinned: "desc" }, { sort: "asc" }, { createdAt: "desc" }],
    });

    return NextResponse.json({ announcements });
  } catch (error) {
    logError("Get announcements", error);
    return NextResponse.json({ error: "获取公告失败" }, { status: 500 });
  }
}

// 创建公告
export async function POST(request: NextRequest) {
  const admin = await getAdminSession();
  if (!admin) {
    return NextResponse.json({ error: "未授权" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { title, content, type, isActive, isPinned, sort } = body;

    if (!title || !content) {
      return NextResponse.json({ error: "标题和内容不能为空" }, { status: 400 });
    }

    const announcement = await prisma.announcement.create({
      data: {
        title,
        content,
        type: type || "info",
        isActive: isActive ?? true,
        isPinned: isPinned ?? false,
        sort: sort ?? 0,
      },
    });

    return NextResponse.json({ announcement });
  } catch (error) {
    logError("Create announcement", error);
    return NextResponse.json({ error: "创建公告失败" }, { status: 500 });
  }
}
