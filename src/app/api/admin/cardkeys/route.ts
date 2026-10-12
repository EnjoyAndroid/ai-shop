import { NextRequest, NextResponse } from "next/server";
import { getAdminSession } from "@/lib/admin-auth";
import { listUnsoldCardKeys } from "@/lib/services/cardkey.service";
import { orderError, orderJson } from "@/lib/order-http";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  if (!await getAdminSession()) return orderJson({ error: "未授权" }, 401);
  try {
    return NextResponse.json(await listUnsoldCardKeys(Object.fromEntries(request.nextUrl.searchParams)), { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return orderError("List unsold cards", error); }
}
