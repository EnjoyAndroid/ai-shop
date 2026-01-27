import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";

// 获取系统设置
export async function GET() {
  try {
    const settingsRows = await prisma.systemSetting.findMany();

    const settings: Record<string, string> = {};
    settingsRows.forEach((row) => {
      settings[row.key] = row.value;
    });

    return NextResponse.json({ settings });
  } catch (error) {
    console.error("Get settings error:", error);
    return NextResponse.json(
      { error: "获取设置失败" },
      { status: 500 }
    );
  }
}

// 保存系统设置
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // 批量更新设置
    const updates = Object.entries(body).map(([key, value]) =>
      prisma.systemSetting.upsert({
        where: { key },
        update: { value: String(value) },
        create: { key, value: String(value) },
      })
    );

    await Promise.all(updates);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Save settings error:", error);
    return NextResponse.json(
      { error: "保存设置失败" },
      { status: 500 }
    );
  }
}
