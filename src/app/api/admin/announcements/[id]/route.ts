import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { getAdminSession } from "@/lib/admin-auth";
import { logError } from "@/lib/logger";

// 更新公告
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await getAdminSession();
  if (!admin) {
    return NextResponse.json({ error: "未授权" }, { status: 401 });
  }

  try {
    const { id } = await params;
    const body = await request.json();

    const announcement = await prisma.announcement.update({
      where: { id },
      data: {
        ...(body.title !== undefined && { title: body.title }),
        ...(body.content !== undefined && { content: body.content }),
        ...(body.type !== undefined && { type: body.type }),
        ...(body.isActive !== undefined && { isActive: body.isActive }),
        ...(body.isPinned !== undefined && { isPinned: body.isPinned }),
        ...(body.sort !== undefined && { sort: body.sort }),
      },
    });

    return NextResponse.json({ announcement });
  } catch (error) {
    logError("Update announcement", error);
    return NextResponse.json({ error: "更新公告失败" }, { status: 500 });
  }
}

// 删除公告
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await getAdminSession();
  if (!admin) {
    return NextResponse.json({ error: "未授权" }, { status: 401 });
  }

  try {
    const { id } = await params;

    await prisma.announcement.delete({
      where: { id },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    logError("Delete announcement", error);
    return NextResponse.json({ error: "删除公告失败" }, { status: 500 });
  }
}
