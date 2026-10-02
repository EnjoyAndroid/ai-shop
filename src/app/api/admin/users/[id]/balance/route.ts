import { NextRequest, NextResponse } from "next/server";
import { getAdminSession, hasAdminPermission } from "@/lib/admin-auth";
import { adjustUserBalance } from "@/lib/services/order.service";
import { logError } from "@/lib/logger";
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await getAdminSession();
  if (!admin) return NextResponse.json({ error: "未授权" }, { status: 401 });
  if (!hasAdminPermission(admin, "finance")) return NextResponse.json({ error: "无权限" }, { status: 403 });
  try {
    const { amount, remark } = await request.json();
    if (!Number.isSafeInteger(amount) || amount === 0 || Math.abs(amount) > 10000000 || (remark && (typeof remark !== "string" || remark.length > 200))) return NextResponse.json({ error: "无效金额或备注" }, { status: 400 });
    return NextResponse.json({ success: true, balance: await adjustUserBalance((await params).id, amount, remark || "管理员调整") });
  } catch (error) {
    logError("Adjust balance", error);
    return NextResponse.json({ error: "调整失败，请检查用户和余额" }, { status: 400 });
  }
}
