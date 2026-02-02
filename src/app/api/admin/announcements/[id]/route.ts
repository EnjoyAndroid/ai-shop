import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { verifyAdmin } from "@/lib/admin-auth";

// 更新公告
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await verifyAdmin(request);
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
    console.error("Update announcement error:", error);
    return NextResponse.json({ error: "更新公告失败" }, { status: 500 });
  }
}

// 删除公告
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await verifyAdmin(request);
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
    console.error("Delete announcement error:", error);
    return NextResponse.json({ error: "删除公告失败" }, { status: 500 });
  }
}
