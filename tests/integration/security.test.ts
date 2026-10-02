import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import prisma from "../../src/lib/db";
import redis from "../../src/lib/redis";
import { encrypt } from "../../src/lib/encryption";
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
  return { user, product, input: { userId: user.id, email: user.email!, paymentMethod: method, items: [{ productId: product.id, quantity: 1 }] } };
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
