import { NextRequest } from "next/server";
import { getAdminSession } from "@/lib/admin-auth";
import { changeUnsoldCardKey, readUnsoldCardKey } from "@/lib/services/cardkey.service";
import { orderError, orderJson } from "@/lib/order-http";

export const dynamic = "force-dynamic";
type Context = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, { params }: Context) {
  if (!await getAdminSession()) return orderJson({ error: "未授权" }, 401);
  try { return orderJson({ card: await readUnsoldCardKey((await params).id) }); }
  catch (error) { return orderError("Read unsold card", error); }
}

export async function PATCH(request: NextRequest, { params }: Context) {
  if (!await getAdminSession()) return orderJson({ error: "未授权" }, 401);
  try { return orderJson(await changeUnsoldCardKey((await params).id, await request.json(), "edit")); }
  catch (error) { return orderError("Edit unsold card", error); }
}

export async function DELETE(request: NextRequest, { params }: Context) {
  if (!await getAdminSession()) return orderJson({ error: "未授权" }, 401);
  try { return orderJson(await changeUnsoldCardKey((await params).id, await request.json(), "delete")); }
  catch (error) { return orderError("Delete unsold card", error); }
}
