import { NextRequest } from "next/server";
import { getClientIp } from "@/lib/get-client-ip";
import { searchOrders } from "@/lib/services/order-query.service";
import { orderError, orderJson } from "@/lib/order-http";

export async function POST(request: NextRequest) {
  try { return orderJson(await searchOrders(await request.json(), getClientIp(request))); }
  catch (error) { return orderError("Search orders", error); }
}
