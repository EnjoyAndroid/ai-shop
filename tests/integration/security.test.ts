import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { randomBytes, createHash } from "node:crypto";
import bcrypt from "bcryptjs";
import { searchOrders, unlockOrder } from "../../src/lib/services/order-query.service";
import { canAccessOrder, issueOrderAccess, issueOrderQuery, readOrderQuery } from "../../src/lib/order-access";
import { createWithOrderNumber } from "../../src/lib/order-number";
import { transaction } from "../../src/lib/transaction";
import { OrderRequestError } from "../../src/lib/order-errors";
import prisma from "../../src/lib/db";
import redis from "../../src/lib/redis";
import { encrypt, generateOrderNo } from "../../src/lib/encryption";
import { createOrder, handlePaymentSuccess, cancelOrder, cancelExpiredOrders, refundOrder } from "../../src/lib/services/order.service";
import { getOrCreateQuote } from "../../src/lib/payment/usdt";
import { authenticateCredentials } from "../../src/lib/authenticate";
import { createCaptcha, verifyCaptcha, consumeCaptchaToken } from "../../src/lib/captcha";

if (process.env.RUN_DATABASE_TESTS !== "1" || !new URL(process.env.DATABASE_URL!).pathname.endsWith("_test")) throw new Error("Tests require an isolated _test database");
const prefix = `test-${randomBytes(6).toString("hex")}`;
const req = new Request("http://localhost/api/auth/callback/credentials");
let categoryId: string;
async function fixture(stock: number, balance = 0, method: "BALANCE" | "ALIPAY" = "ALIPAY") {
  const suffix = randomBytes(6).toString("hex");
  const user = await prisma.user.create({ data: { email: `${prefix}-${suffix}@example.invalid`, balance } });
  const product = await prisma.product.create({ data: { categoryId, name: prefix, slug: `${prefix}-${suffix}`, price: 100, maxQuantity: 10, stock } });
  await prisma.cardKey.createMany({ data: Array.from({ length: stock }, (_, i) => ({ productId: product.id, ...encrypt(`SYNTHETIC-${suffix}-${i}`) })) });
  return { user, product, input: { userId: user.id, email: user.email!, paymentMethod: method, productId: product.id, quantity: 1, queryPassword: "test-order-password" } };
}
before(async () => {
  process.env.ENCRYPTION_KEY ||= randomBytes(32).toString("hex");
  process.env.NEXTAUTH_SECRET ||= randomBytes(32).toString("hex");
  process.env.SMTP_HOST = ""; process.env.TELEGRAM_BOT_TOKEN = "";
  await redis.flushdb();
  categoryId = (await prisma.category.create({ data: { name: prefix, slug: prefix } })).id;
});
after(async () => { await prisma.$disconnect(); await redis.quit(); });

test("concurrent stock reservations never allocate a single card twice", async () => {
  const f = await fixture(1);
  const results = await Promise.allSettled([createOrder(f.input), createOrder(f.input)]);
  assert.equal(results.filter(r => r.status === "fulfilled").length, 1);
  assert.equal(await prisma.cardKey.count({ where: { productId: f.product.id, status: "LOCKED" } }), 1);
  const order = results.find(r => r.status === "fulfilled") as PromiseFulfilledResult<Awaited<ReturnType<typeof createOrder>>>;
  assert.equal(await cancelOrder(order.value.id), true);
  assert.equal(await prisma.cardKey.count({ where: { productId: f.product.id, status: "AVAILABLE" } }), 1);
});

test("concurrent balance purchases cannot overdraw or leave unpaid reservations", async () => {
  const f = await fixture(2, 100, "BALANCE");
  const results = await Promise.allSettled([createOrder(f.input), createOrder(f.input)]);
  assert.equal(results.filter(r => r.status === "fulfilled").length, 1);
  assert.equal((await prisma.user.findUniqueOrThrow({ where: { id: f.user.id } })).balance, 0);
  assert.equal(await prisma.balanceLog.count({ where: { userId: f.user.id, type: "CONSUME" } }), 1);
  assert.equal(await prisma.cardKey.count({ where: { productId: f.product.id, status: "SOLD" } }), 1);
  assert.equal(await prisma.cardKey.count({ where: { productId: f.product.id, status: "LOCKED" } }), 0);
  const order = await prisma.order.findFirstOrThrow({ where: { userId: f.user.id } });
  const refunds = await Promise.allSettled([refundOrder(order.id), refundOrder(order.id)]);
  assert.equal(refunds.filter(r => r.status === "fulfilled").length, 1);
  assert.equal((await prisma.user.findUniqueOrThrow({ where: { id: f.user.id } })).balance, 100);
  assert.equal(await prisma.balanceLog.count({ where: { userId: f.user.id, type: "REFUND" } }), 1);
});

test("callback mismatch changes nothing, duplicate callbacks deliver once", async () => {
  const f = await fixture(1);
  const order = await createOrder(f.input);
  const evidence = { method: "ALIPAY" as const, amount: 100 };
  await assert.rejects(handlePaymentSuccess(order.orderNo, `${prefix}-mismatch`, { ...evidence, amount: 1 }));
  await assert.rejects(handlePaymentSuccess(order.orderNo, `${prefix}-mismatch`, { ...evidence, method: "WECHAT" }));
  assert.equal(await prisma.paymentReceipt.count({ where: { orderId: order.id } }), 0);
  const results = await Promise.all([handlePaymentSuccess(order.orderNo, `${prefix}-payment`, evidence), handlePaymentSuccess(order.orderNo, `${prefix}-payment`, evidence)]);
  assert(results.every(r => r.status === "DELIVERED"));
  assert.equal(await prisma.paymentReceipt.count({ where: { orderId: order.id } }), 1);
  assert.equal((await prisma.product.findUniqueOrThrow({ where: { id: f.product.id } })).salesCount, 1);
});

test("fulfillment failure rolls back receipt and order status", async () => {
  const f = await fixture(1);
  const order = await createOrder(f.input);
  await prisma.cardKey.updateMany({ where: { productId: f.product.id }, data: { status: "INVALID" } });
  await assert.rejects(handlePaymentSuccess(order.orderNo, `${prefix}-rollback`, { method: "ALIPAY", amount: 100 }));
  assert.equal((await prisma.order.findUniqueOrThrow({ where: { id: order.id } })).status, "PENDING");
  assert.equal(await prisma.paymentReceipt.count({ where: { orderId: order.id } }), 0);
});

test("a payment transaction can credit only one recharge once", async () => {
  const user = await prisma.user.create({ data: { email: `${prefix}-recharge@example.invalid` } });
  const make = (suffix: string) => prisma.order.create({ data: { orderNo: `${prefix}-recharge-${suffix}`, userId: user.id, paymentMethod: "ALIPAY", totalAmount: 100, payAmount: 100, expiredAt: new Date(Date.now() + 600000) } });
  const a = await make("a"), b = await make("b");
  const evidence = { method: "ALIPAY" as const, amount: 100 };
  const results = await Promise.allSettled([handlePaymentSuccess(a.orderNo, `${prefix}-same-tx`, evidence), handlePaymentSuccess(b.orderNo, `${prefix}-same-tx`, evidence)]);
  assert.equal(results.filter(r => r.status === "fulfilled").length, 1);
  const paid = await prisma.order.findFirstOrThrow({ where: { userId: user.id, status: "COMPLETED" } });
  await handlePaymentSuccess(paid.orderNo, `${prefix}-same-tx`, evidence);
  assert.equal((await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).balance, 100);
  assert.equal(await prisma.balanceLog.count({ where: { userId: user.id, type: "RECHARGE" } }), 1);
});

test("expired order cannot settle and cancellation releases stock", async () => {
  const f = await fixture(1);
  const order = await createOrder(f.input);
  await prisma.order.update({ where: { id: order.id }, data: { expiredAt: new Date(Date.now() - 1000) } });
  await assert.rejects(handlePaymentSuccess(order.orderNo, `${prefix}-expired`, { method: "ALIPAY", amount: 100 }));
  await cancelExpiredOrders();
  assert.equal((await prisma.order.findUniqueOrThrow({ where: { id: order.id } })).status, "CANCELLED");
  assert.equal(await prisma.cardKey.count({ where: { productId: f.product.id, status: "AVAILABLE" } }), 1);
});

test("USDT quote is stable under concurrent calls and changing exchange rates", async () => {
  process.env.USDT_TRC20_ADDRESS = "T" + "1".repeat(33);
  const user = await prisma.user.create({ data: { email: `${prefix}-quote@example.invalid` } });
  const order = await prisma.order.create({ data: { orderNo: `${prefix}-quote`, userId: user.id, paymentMethod: "USDT_TRC20", totalAmount: 100, payAmount: 100, expiredAt: new Date(Date.now() + 600000) } });
  await redis.set("usdt:exchange_rate", JSON.stringify({ rate: 7, source: "test", updatedAt: Date.now() }));
  const quotes = await Promise.all([getOrCreateQuote(order.orderNo, 100), getOrCreateQuote(order.orderNo, 100)]);
  assert.equal(quotes[0].id, quotes[1].id);
  await redis.set("usdt:exchange_rate", JSON.stringify({ rate: 8, source: "test", updatedAt: Date.now() }));
  assert.equal((await getOrCreateQuote(order.orderNo, 100)).amountMicros, quotes[0].amountMicros);
});

test("actual credential verification enforces failures and one-use captcha", async () => {
  const email = `${prefix}-login@example.invalid`;
  await prisma.user.create({ data: { email, password: await bcrypt.hash("test-user-password", 4) } });
  for (let i = 0; i < 3; i++) assert.equal(await authenticateCredentials({ account: email, password: "wrong" }, req), null);
  assert.equal(await authenticateCredentials({ account: email, password: "test-user-password" }, req), null);
  const challenge = await createCaptcha("direct");
  assert.equal("position" in challenge, false);
  const data = JSON.parse((await redis.get(`captcha:${challenge.token}`))!);
  await redis.set(`captcha:${challenge.token}`, JSON.stringify({ ...data, createdAt: Date.now() - 1000 }));
  assert.equal(await verifyCaptcha(challenge.token, data.position, "direct"), true);
  assert.equal((await authenticateCredentials({ account: email, password: "test-user-password", captchaToken: challenge.token }, req))?.email, email);
  assert.equal(await consumeCaptchaToken(challenge.token, "direct"), false);
});

async function verifiedCaptcha(ip: string) {
  const challenge = await createCaptcha(ip);
  const data = JSON.parse((await redis.get(`captcha:${challenge.token}`))!);
  await redis.set(`captcha:${challenge.token}`, JSON.stringify({ ...data, createdAt: Date.now() - 1000 }), "KEEPTTL");
  assert.equal(await verifyCaptcha(challenge.token, data.position, ip), true);
  return challenge.token;
}
const httpStatus = (status: number) => (error: unknown) => error instanceof OrderRequestError && error.status === status;
const grantKey = (scope: string, token: string) => `order:${scope}:${createHash("sha256").update(token).digest("hex")}`;

test("new orders store only bcrypt hashes and service validation rejects missing passwords", async () => {
  const f = await fixture(1);
  await assert.rejects(createOrder({ ...f.input, queryPassword: "" }));
  assert.equal(await prisma.order.count({ where: { userId: f.user.id } }), 0);
  const order = await createOrder({ ...f.input, email: f.input.email.toUpperCase() + " " });
  assert.equal(order.email, f.input.email);
  assert.equal(order.items.length, 1);
  assert.equal("queryPassword" in order, false);
  assert.equal(bcrypt.getRounds(order.queryPasswordHash!), 12);
  assert(await bcrypt.compare(f.input.queryPassword, order.queryPasswordHash!));
});

test("captcha gates exact email search, pagination is stable and summaries exclude secrets and recharge", async () => {
  const f = await fixture(0);
  const orders = await prisma.$transaction(Array.from({ length: 23 }, (_, index) => prisma.order.create({ data: {
    orderNo: generateOrderNo(), email: f.user.email, userId: f.user.id, totalAmount: 100, payAmount: 100,
    queryPasswordHash: "private-hash", adminRemark: "private-remark", ip: "private-ip",
    status: index < 3 ? "REFUNDED" : index < 6 ? "DELIVERED" : "PENDING",
    createdAt: new Date(1700000000000 + index * 1000),
    items: { create: { productId: f.product.id, productName: "search test", price: 100, quantity: 1 } },
  } })));
  await prisma.order.create({ data: { orderNo: `R${generateOrderNo()}`, email: f.user.email, userId: f.user.id, totalAmount: 100, payAmount: 100 } });
  const ip = `${prefix}-search`;
  const token = await verifiedCaptcha(ip);
  const first = await searchOrders({ keyword: ` ${f.user.email!.toUpperCase()} `, captchaToken: token }, ip);
  assert.equal(first.total, 23); assert.equal(first.orders.length, 20);
  assert.deepEqual(first.orders.map(order => order.orderNo), orders.slice(3).reverse().map(order => order.orderNo));
  for (const order of first.orders) {
    assert.deepEqual(Object.keys(order).sort(), ["orderNo", "createdAt", "payAmount", "status", "items"].sort());
    assert.deepEqual(Object.keys(order.items[0]).sort(), ["productName", "quantity"]);
  }
  await assert.rejects(searchOrders({ keyword: f.user.email, captchaToken: token }, ip), httpStatus(403));
  await assert.rejects(searchOrders({ queryToken: first.queryToken }, "wrong-ip"), httpStatus(403));
  const second = await searchOrders({ queryToken: first.queryToken, page: 2 }, ip);
  assert.deepEqual(second.orders.map(order => order.orderNo), orders.slice(0, 3).reverse().map(order => order.orderNo));
  assert.equal((await searchOrders({ queryToken: first.queryToken, status: "PAID" }, ip)).total, 3);
  assert.equal((await searchOrders({ queryToken: first.queryToken, status: "REFUNDED" }, ip)).total, 3);
  const single = await searchOrders({ keyword: orders[0].orderNo.toLowerCase(), captchaToken: await verifiedCaptcha(ip) }, ip);
  assert.equal(single.total, 1); assert.equal(single.orders[0].orderNo, orders[0].orderNo);
  const empty = await searchOrders({ keyword: `${prefix}-absent@example.invalid`, captchaToken: await verifiedCaptcha(ip) }, ip);
  assert.equal(empty.total, 0);
});

test("public details require the order password even for members; tokens cannot cross orders or grant recharge access", async () => {
  const f = await fixture(2);
  const order = await createOrder(f.input);
  const other = await createOrder({ ...f.input, email: `${prefix}-other@example.invalid` });
  const ip = `${prefix}-unlock`;
  const query = await issueOrderQuery(f.input.email, ip);
  assert.equal(await canAccessOrder(order, ""), false);
  assert.equal(await canAccessOrder(order, "", f.user.id), true);
  assert.equal(await canAccessOrder(order, "", "someone-else"), false);
  await assert.rejects(unlockOrder(order.orderNo, { queryToken: query, password: "wrong-password" }, ip), httpStatus(403));
  await assert.rejects(unlockOrder(other.orderNo, { queryToken: query, password: f.input.queryPassword }, ip), httpStatus(403));
  const { accessToken } = await unlockOrder(order.orderNo, { queryToken: query, password: f.input.queryPassword }, ip);
  assert.equal(await canAccessOrder(order, accessToken), true);
  assert.equal(await canAccessOrder(other, accessToken), false);
  assert.equal(await canAccessOrder(order, query), false);
  assert.equal(await canAccessOrder(order, "a".repeat(64)), false);
  assert.equal(await redis.exists(`order:access:${accessToken}`), 0);
  assert((await redis.ttl(grantKey("access", accessToken))) > 1700);
  assert((await redis.ttl(grantKey("query", query))) > 500);
  await redis.expire(grantKey("access", accessToken), 0);
  assert.equal(await canAccessOrder(order, accessToken), false);
  await redis.expire(grantKey("query", query), 0);
  await assert.rejects(unlockOrder(order.orderNo, { queryToken: query, password: f.input.queryPassword }, ip), httpStatus(403));
  const recharge = await prisma.order.create({ data: { orderNo: `R${generateOrderNo()}`, userId: f.user.id, totalAmount: 100, payAmount: 100 } });
  const rechargeToken = await issueOrderAccess(recharge.id);
  assert.equal(await canAccessOrder(recharge, rechargeToken), false);
  assert.equal(await canAccessOrder(recharge, "", f.user.id), true);
});

test("password attempts are limited per order and IP independently of status polling", async () => {
  const f = await fixture(1);
  const order = await createOrder(f.input);
  const ip = `${prefix}-limited`;
  const queryToken = await issueOrderQuery(order.orderNo, ip);
  for (let attempt = 0; attempt < 10; attempt++) {
    await assert.rejects(unlockOrder(order.orderNo, { queryToken, password: "wrong-password" }, ip), httpStatus(403));
  }
  await assert.rejects(unlockOrder(order.orderNo, { queryToken, password: f.input.queryPassword }, ip), httpStatus(429));
  const accessToken = await issueOrderAccess(order.id);
  for (let attempt = 0; attempt < 25; attempt++) assert.equal(await canAccessOrder(order, accessToken), true);
  const globalIp = `${prefix}-global-limit`;
  for (let attempt = 0; attempt < 50; attempt++) {
    await assert.rejects(unlockOrder(generateOrderNo(), { queryToken: "f".repeat(64), password: "wrong-password" }, globalIp), httpStatus(403));
  }
  await assert.rejects(unlockOrder(generateOrderNo(), { queryToken: "f".repeat(64), password: "wrong-password" }, globalIp), httpStatus(429));
});

test("unverified and expired captchas cannot query; search rate limit covers failed attempts", async () => {
  const ip = `${prefix}-captcha-limit`;
  const challenge = await createCaptcha(ip);
  await assert.rejects(searchOrders({ keyword: "test@example.invalid", captchaToken: challenge.token }, ip), httpStatus(403));
  await redis.del(`captcha:${challenge.token}`);
  for (let count = 1; count < 10; count++) await assert.rejects(searchOrders({ keyword: "test@example.invalid", captchaToken: challenge.token }, ip), httpStatus(403));
  await assert.rejects(searchOrders({ keyword: "test@example.invalid", captchaToken: challenge.token }, ip), httpStatus(429));
});

test("order number retries roll back the entire failed transaction", async () => {
  const f = await fixture(0, 100);
  const existing = await prisma.order.create({ data: { orderNo: generateOrderNo(), totalAmount: 100, payAmount: 100 } });
  let attempt = 0;
  const result = await createWithOrderNumber(orderNo => transaction(async tx => {
    await tx.user.update({ where: { id: f.user.id }, data: { balance: { increment: 1 } } });
    return tx.order.create({ data: { orderNo: attempt++ === 0 ? existing.orderNo : orderNo, userId: f.user.id, totalAmount: 100, payAmount: 100 } });
  }));
  assert.notEqual(result.orderNo, existing.orderNo);
  assert.equal(attempt, 2);
  assert.equal((await prisma.user.findUniqueOrThrow({ where: { id: f.user.id } })).balance, 101);
  assert.equal(await prisma.order.count({ where: { userId: f.user.id } }), 1);
});

test("Redis errors never grant query or order access", async context => {
  const query = await issueOrderQuery("test@example.invalid", "redis-test");
  const get = context.mock.method(redis, "get", async () => { throw new Error("Redis unavailable"); });
  try {
    await assert.rejects(readOrderQuery(query, "redis-test"));
    await assert.rejects(canAccessOrder({ id: "test", orderNo: generateOrderNo(), userId: null }, "f".repeat(64)));
  } finally { get.mock.restore(); }
});
