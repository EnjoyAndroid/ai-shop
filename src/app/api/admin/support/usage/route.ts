import { getAdminSession, hasAdminPermission } from "@/lib/admin-auth";
import { orderJson, orderError } from "@/lib/order-http";
import { supportUsageSummary } from "@/lib/support/service";

export const dynamic = "force-dynamic";

export async function GET() {
  const admin = await getAdminSession();
  if (!admin || !hasAdminPermission(admin, "settings")) return orderJson({ error: "无权限" }, 403);
  try { return orderJson(await supportUsageSummary()); } catch (error) { return orderError("Support usage", error); }
}

