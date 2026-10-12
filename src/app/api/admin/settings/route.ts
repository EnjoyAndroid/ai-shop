import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { clearSettingsCache } from "@/lib/services/settings.service";
import { getAdminSession, hasAdminPermission } from "@/lib/admin-auth";
import { logError } from "@/lib/logger";
import { telegramUrlSchema } from "@/lib/contact-settings";
import { wechatGroupQrUrlSchema, wechatGroupExpiresAtSchema } from "@/lib/community-settings";

// 获取系统设置
export async function GET() {
  const admin = await getAdminSession();
  if (!admin) {
    return NextResponse.json({ error: "未授权" }, { status: 401 });
  }

  if (!hasAdminPermission(admin, "settings")) return NextResponse.json({ error: "无权限" }, { status: 403 });
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

  if (!hasAdminPermission(admin, "settings")) return NextResponse.json({ error: "无权限" }, { status: 403 });
  try {
    const body = await request.json();

    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return NextResponse.json({ error: "设置格式无效" }, { status: 400 });
    }
    if (Object.hasOwn(body, "telegramUrl")) {
      const result = telegramUrlSchema.safeParse(body.telegramUrl);
      if (!result.success) {
        return NextResponse.json({ error: result.error.errors[0].message }, { status: 400 });
      }
      body.telegramUrl = result.data;
    }
    for (const [key, schema] of [
      ["wechatGroupQrUrl", wechatGroupQrUrlSchema],
      ["wechatGroupExpiresAt", wechatGroupExpiresAtSchema],
    ] as const) {
      if (!Object.hasOwn(body, key)) continue;
      const result = schema.safeParse(body[key]);
      if (!result.success) {
        return NextResponse.json({ error: result.error.errors[0].message }, { status: 400 });
      }
      body[key] = result.data;
    }

    // 批量更新设置
    const updates = Object.entries(body).map(([key, value]) =>
      prisma.systemSetting.upsert({
        where: { key },
        update: { value: String(value) },
        create: { key, value: String(value) },
      })
    );

    await prisma.$transaction(updates);

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
