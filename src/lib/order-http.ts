import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { auth } from "./auth";
import prisma from "./db";
import { getClientIp } from "./get-client-ip";
import { rateLimit } from "./rate-limit";
import { canAccessOrder } from "./order-access";
import { ORDER_PATTERN } from "./order-rules";
import { logError } from "./logger";

import { OrderRequestError } from "./order-errors";
export { OrderRequestError } from "./order-errors";

export function orderJson(data: unknown, status = 200) {
  return NextResponse.json(data, { status, headers: { "Cache-Control": "no-store" } });
}

export function orderError(context: string, error: unknown) {
  if (error instanceof OrderRequestError) return orderJson({ error: error.message, code: error.code }, error.status);
  if (error instanceof ZodError) return orderJson({ error: error.issues[0].message }, 400);
  if (error instanceof SyntaxError) return orderJson({ error: "请求格式无效" }, 400);
  logError(context, error);
  return orderJson({ error: "订单服务暂不可用，请稍后重试" }, 503);
}

export async function limitOrderRequest(scope: string, id: string, max: number, seconds: number) {
  if (!await rateLimit(scope, id, max, seconds)) throw new OrderRequestError("请求过于频繁，请稍后再试", 429);
}

export async function accessibleOrder(request: Request, orderNo: string, scope: string) {
  if (!ORDER_PATTERN.test(orderNo)) throw new OrderRequestError("订单不存在", 404);
  await limitOrderRequest(scope, `${getClientIp(request)}:${orderNo}`, 60, 60);
  const order = await prisma.order.findUnique({
    where: { orderNo },
    select: { id: true, orderNo: true, userId: true, status: true, payAmount: true, paymentMethod: true, expiredAt: true },
  });
  if (!order) throw new OrderRequestError("订单不存在", 404);
  const session = await auth();
  if (!await canAccessOrder(order, request.headers.get("x-order-access-token") || "", session?.user?.id)) {
    throw new OrderRequestError("请先验证订单查询密码或登录本人账号", 403, "ORDER_ACCESS_REQUIRED");
  }
  return order;
}
