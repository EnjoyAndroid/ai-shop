import { NextRequest } from "next/server";
import prisma from "@/lib/db";
import { clearSettingsCache } from "@/lib/services/settings.service";
import { getAdminSession, hasAdminPermission } from "@/lib/admin-auth";
import { CONTACT_SETTING_KEYS, EMPTY_CONTACT_SETTINGS, contactSettingsSchema } from "@/lib/contact-settings";
import { orderError, orderJson } from "@/lib/order-http";
import { readBoundedJson } from "@/lib/request-body";

export const dynamic = "force-dynamic";

export async function GET() {
  const admin = await getAdminSession();
  if (!admin) return orderJson({ error: "未授权" }, 401);
  if (!hasAdminPermission(admin, "settings")) return orderJson({ error: "无权限" }, 403);
  try {
    const rows = await prisma.systemSetting.findMany({ where: { key: { in: CONTACT_SETTING_KEYS } } });
    return orderJson({ settings: { ...EMPTY_CONTACT_SETTINGS, ...Object.fromEntries(rows.map(row => [row.key, row.value])) } });
  } catch (error) { return orderError("Get contact settings", error); }
}

export async function POST(request: NextRequest) {
  const admin = await getAdminSession();
  if (!admin) return orderJson({ error: "未授权" }, 401);
  if (!hasAdminPermission(admin, "settings")) return orderJson({ error: "无权限" }, 403);
  try {
    const body = contactSettingsSchema.partial().parse(await readBoundedJson(request, 16 * 1024));
    await prisma.$transaction(Object.entries(body).map(([key, value]) => prisma.systemSetting.upsert({ where: { key }, update: { value }, create: { key, value } })));
    await clearSettingsCache();
    return orderJson({ success: true });
  } catch (error) { return orderError("Save contact settings", error); }
}
