import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { clearSettingsCache } from "@/lib/services/settings.service";
import { getAdminSession } from "@/lib/admin-auth";
import { logError } from "@/lib/logger";

// 获取系统设置
export async function GET() {
  const admin = await getAdminSession();
  if (!admin) {
    return NextResponse.json({ error: "未授权" }, { status: 401 });
  }

  try {
    const settingsRows = await prisma.systemSetting.findMany();

    const settings: Record<string, string> = {};
    settingsRows.forEach((row) => {
      settings[row.key] = row.value;
    });

    return NextResponse.json({ settings });
  } catch (error) {
    logError("Get settings", error);
    return NextResponse.json(
      { error: "获取设置失败" },
      { status: 500 }
    );
  }
}

// 保存系统设置
export async function POST(request: NextRequest) {
  const admin = await getAdminSession();
  if (!admin) {
    return NextResponse.json({ error: "未授权" }, { status: 401 });
  }

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

    // 清除设置缓存
    await clearSettingsCache();

    return NextResponse.json({ success: true });
  } catch (error) {
    logError("Save settings", error);
    return NextResponse.json(
      { error: "保存设置失败" },
      { status: 500 }
    );
  }
}
