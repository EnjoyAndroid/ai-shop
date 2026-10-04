import bcrypt from "bcryptjs";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import prisma from "@/lib/db";
import { consumeCaptchaToken } from "@/lib/captcha";
import { issueOrderAccess, issueOrderQuery, readOrderQuery } from "@/lib/order-access";
import { orderFilterSchema, orderKeywordSchema, orderPasswordSchema, PRODUCT_ORDER_PATTERN } from "@/lib/order-rules";
import { OrderRequestError } from "@/lib/order-errors";
import { rateLimit } from "@/lib/rate-limit";

const tokenSchema = z.string().regex(/^[a-f0-9]{64}$/, "验证凭证无效，请重新查询");
const paging = { status: orderFilterSchema.default("ALL"), page: z.number().int().min(1).max(100000).default(1) };
const searchSchema = z.union([
  z.object({ keyword: orderKeywordSchema, captchaToken: tokenSchema, ...paging }).strict(),
  z.object({ queryToken: tokenSchema, ...paging }).strict(),
]);
const unlockSchema = z.object({ queryToken: tokenSchema, password: orderPasswordSchema }).strict();
const queryExpired = () => new OrderRequestError("查询验证已失效，请重新完成滑块验证", 403, "QUERY_EXPIRED");
const queryWhere = (keyword: string): Prisma.OrderWhereInput => ({
  ...(keyword.includes("@") ? { email: keyword } : {}),
  items: { some: {} },
  orderNo: keyword.includes("@") ? { startsWith: "AS" } : keyword,
});

export async function searchOrders(input: unknown, ip: string) {
  const body = searchSchema.parse(input);
  const continuing = "queryToken" in body;
  if (!await rateLimit(continuing ? "order-search-page" : "order-search", ip, continuing ? 60 : 10, 60)) {
    throw new OrderRequestError("查询过于频繁，请稍后再试", 429);
  }
  let keyword: string;
  let queryToken: string;
  if (continuing) {
    const saved = await readOrderQuery(body.queryToken, ip);
    if (!saved) throw queryExpired();
    keyword = saved;
    queryToken = body.queryToken;
  } else {
    if (!await consumeCaptchaToken(body.captchaToken, ip)) throw queryExpired();
    keyword = body.keyword;
    queryToken = await issueOrderQuery(keyword, ip);
  }
  const where: Prisma.OrderWhereInput = {
    ...queryWhere(keyword),
    ...(body.status === "ALL" ? {} : body.status === "PAID"
      ? { status: { in: ["PAID", "DELIVERED", "COMPLETED"] } } : { status: body.status }),
  };
  const pageSize = 20;
  const [orders, total] = await prisma.$transaction([
    prisma.order.findMany({
      where,
      select: { orderNo: true, createdAt: true, payAmount: true, status: true, items: { select: { productName: true, quantity: true } } },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip: (body.page - 1) * pageSize, take: pageSize,
    }),
    prisma.order.count({ where }),
  ], { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
  return { orders, total, page: body.page, pageSize, queryToken };
}

export async function unlockOrder(orderNo: string, input: unknown, ip: string) {
  if (!PRODUCT_ORDER_PATTERN.test(orderNo)) throw new OrderRequestError("商品订单号无效", 400);
  const body = unlockSchema.parse(input);
  if (!await rateLimit("order-unlock-ip", ip, 50, 600) ||
      !await rateLimit("order-unlock", `${ip}:${orderNo}`, 10, 600)) {
    throw new OrderRequestError("密码验证过于频繁，请10分钟后重试", 429);
  }
  const keyword = await readOrderQuery(body.queryToken, ip);
  if (!keyword) throw queryExpired();
  const order = await prisma.order.findFirst({
    where: { AND: [queryWhere(keyword), { orderNo }] },
    select: { id: true, queryPasswordHash: true },
  });
  if (!order?.queryPasswordHash || !await bcrypt.compare(body.password, order.queryPasswordHash)) {
    throw new OrderRequestError("订单或查询密码错误", 403, "PASSWORD_INCORRECT");
  }
  return { accessToken: await issueOrderAccess(order.id) };
}
