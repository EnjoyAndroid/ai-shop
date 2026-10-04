import { NextRequest } from "next/server";
import { getClientIp } from "@/lib/get-client-ip";
import { unlockOrder } from "@/lib/services/order-query.service";
import { orderError, orderJson } from "@/lib/order-http";

export async function POST(request: NextRequest, { params }: { params: Promise<{ orderNo: string }> }) {
  try { return orderJson(await unlockOrder((await params).orderNo, await request.json(), getClientIp(request))); }
  catch (error) { return orderError("Unlock order", error); }
}
