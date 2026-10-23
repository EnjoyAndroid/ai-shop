import { NextRequest } from "next/server";
import { z } from "zod";
import prisma from "@/lib/db";
import { getAdminSession, hasAdminPermission } from "@/lib/admin-auth";
import { orderError, orderJson } from "@/lib/order-http";
import { readBoundedJson } from "@/lib/request-body";
import { getSupportConfig, supportModelConfigured } from "@/lib/support/config";

export const dynamic = "force-dynamic";
const configSchema = z.object({ model: z.string().trim().min(1).max(100), dailyBudgetCny: z.number().min(0).max(100000) }).strict();

export async function GET() {
  const admin = await getAdminSession();
  if (!admin || !hasAdminPermission(admin, "settings")) return orderJson({ error: "无权限" }, 403);
  const config = await getSupportConfig();
  return orderJson({ provider: config.provider, baseUrl: config.baseUrl, model: config.model, dailyBudgetCny: config.dailyBudgetCny, configured: supportModelConfigured(config), apiKeyConfigured: Boolean(config.apiKey) });
}

export async function POST(request: NextRequest) {
  const admin = await getAdminSession();
  if (!admin || !hasAdminPermission(admin, "settings")) return orderJson({ error: "无权限" }, 403);
  try {
    const body = configSchema.parse(await readBoundedJson(request, 4096));
    await prisma.$transaction([
      prisma.systemSetting.upsert({ where: { key: "supportLlmModel" }, update: { value: body.model }, create: { key: "supportLlmModel", value: body.model } }),
      prisma.systemSetting.upsert({ where: { key: "supportDailyBudgetCny" }, update: { value: String(body.dailyBudgetCny) }, create: { key: "supportDailyBudgetCny", value: String(body.dailyBudgetCny) } }),
    ]);
    return orderJson({ success: true });
  } catch (error) { return orderError("Save support config", error); }
}

