import test, { before, beforeEach, after } from "node:test";
import assert from "node:assert/strict";
import { randomBytes, createHash } from "node:crypto";
import bcrypt from "bcryptjs";
import nodemailer from "nodemailer";
import { NextRequest } from "next/server";
import { POST as requestPasswordReset } from "../../src/app/api/auth/forgot-password/route";
import { POST as resetPassword } from "../../src/app/api/auth/reset-password/route";
import { POST as verifyResetToken } from "../../src/app/api/auth/verify-reset-token/route";
import { resetTokenKey } from "../../src/lib/password-reset";
import { handleXunhuCallback } from "../../src/lib/payment/callback";
import { queryUSDTPayment } from "../../src/lib/payment/usdt";
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
import { listUnsoldCardKeys, readUnsoldCardKey, changeUnsoldCardKey } from "../../src/lib/services/cardkey.service";
import { importCardKeys } from "../../src/lib/services/product.service";
import { withSupportDbAbort, disconnectSupportCancellationClient } from "../../src/lib/support/db-abort";
import { PrismaClient } from "@prisma/client";

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
beforeEach(async () => { await redis.del('support:v2:circuit'); });
after(async () => { await disconnectSupportCancellationClient(); await prisma.$disconnect(); await redis.quit(); });

test("unsold card listing never returns secrets; editing encrypts content and stale edits are rejected", async () => {
  const f = await fixture(23);
  const first = await listUnsoldCardKeys({ productId: f.product.id });
  const second = await listUnsoldCardKeys({ productId: f.product.id, page: 2 });
  assert.equal(first.cards.length, 20); assert.equal(second.cards.length, 3); assert.equal(first.total, 23);
  assert(!JSON.stringify(first).includes('SYNTHETIC'));
  for (const key of ['content', 'iv', 'tag', 'orderId']) assert(!Object.hasOwn(first.cards[0], key));
  assert(first.cards.every(card => card.canManage));
  const card = await readUnsoldCardKey(first.cards[0].id);
  const updated = await changeUnsoldCardKey(card.id, { content: 'SYNTHETIC-EDITED-KEY', batchNo: 'edited-batch', updatedAt: card.updatedAt.toISOString() }, 'edit');
  assert.equal(updated.stock, 23);
  const stored = await prisma.cardKey.findUniqueOrThrow({ where: { id: card.id } });
  assert.notEqual(stored.content, 'SYNTHETIC-EDITED-KEY'); assert.equal(stored.batchNo, 'edited-batch');
  const reread = await readUnsoldCardKey(card.id); assert.equal(reread.content, 'SYNTHETIC-EDITED-KEY');
  await assert.rejects(changeUnsoldCardKey(card.id, { content: 'SYNTHETIC-STALE', batchNo: '', updatedAt: card.updatedAt.toISOString() }, 'edit'), httpStatus(409));
  await assert.rejects(changeUnsoldCardKey(card.id, { updatedAt: card.updatedAt.toISOString() }, 'delete'), httpStatus(409));
});

test("inventory deletion updates stock and cache; locked and sold cards remain protected", async () => {
  const f = await fixture(2, 100, 'BALANCE');
  const available = await prisma.cardKey.findFirstOrThrow({ where: { productId: f.product.id } });
  await redis.set(`product:${f.product.slug}`, 'stale-cache'); await redis.set('products:list', 'stale-list');
  assert.equal((await changeUnsoldCardKey(available.id, { updatedAt: available.updatedAt.toISOString() }, 'delete')).stock, 1);
  assert.equal(await prisma.cardKey.count({ where: { id: available.id } }), 0);
  assert.equal((await prisma.product.findUniqueOrThrow({ where: { id: f.product.id } })).stock, 1);
  assert.equal(await redis.exists(`product:${f.product.slug}`), 0); assert.equal(await redis.exists('products:list'), 0);
  const pending = await createOrder({ ...f.input, paymentMethod: 'ALIPAY' });
  const locked = await prisma.cardKey.findFirstOrThrow({ where: { productId: f.product.id, status: 'LOCKED' } });
  const listing = await listUnsoldCardKeys({ productId: f.product.id, status: 'ALL' });
  assert.equal(listing.cards.length, 1); assert.equal(listing.cards[0].canManage, false);
  await assert.rejects(readUnsoldCardKey(locked.id), httpStatus(409));
  for (const action of ['edit', 'delete'] as const) await assert.rejects(changeUnsoldCardKey(locked.id, action === 'edit' ? { content: 'SYNTHETIC-REPLACE', batchNo: '', updatedAt: locked.updatedAt.toISOString() } : { updatedAt: locked.updatedAt.toISOString() }, action), httpStatus(409));
  await cancelOrder(pending.id);
  await createOrder(f.input);
  const sold = await prisma.cardKey.findUniqueOrThrow({ where: { id: locked.id } });
  assert.equal(sold.status, 'SOLD');
  assert.equal((await listUnsoldCardKeys({ productId: f.product.id, status: 'ALL' })).total, 0);
  await assert.rejects(readUnsoldCardKey(sold.id), httpStatus(409));
  await assert.rejects(changeUnsoldCardKey(sold.id, { updatedAt: sold.updatedAt.toISOString() }, 'delete'), httpStatus(409));
  const invalid = await prisma.cardKey.create({ data: { productId: f.product.id, status: 'INVALID', ...encrypt('SYNTHETIC-INVALID') } });
  assert.equal((await readUnsoldCardKey(invalid.id)).content, 'SYNTHETIC-INVALID');
  await changeUnsoldCardKey(invalid.id, { content: 'SYNTHETIC-INVALID-EDIT', batchNo: '', updatedAt: invalid.updatedAt.toISOString() }, 'edit');
  const current = await prisma.cardKey.findUniqueOrThrow({ where: { id: invalid.id } });
  await changeUnsoldCardKey(invalid.id, { updatedAt: current.updatedAt.toISOString() }, 'delete');
  assert.equal((await prisma.product.findUniqueOrThrow({ where: { id: f.product.id } })).stock, 0);
});

test("deleting a card concurrently with checkout cannot remove a sold card or debit without delivery", async () => {
  const f = await fixture(1, 100, 'BALANCE');
  const card = await prisma.cardKey.findFirstOrThrow({ where: { productId: f.product.id } });
  const results = await Promise.allSettled([createOrder(f.input), changeUnsoldCardKey(card.id, { updatedAt: card.updatedAt.toISOString() }, 'delete')]);
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
  const product = await prisma.product.findUniqueOrThrow({ where: { id: f.product.id } });
  const user = await prisma.user.findUniqueOrThrow({ where: { id: f.user.id } });
  assert.equal(product.stock, 0);
  if (results[0].status === 'fulfilled') {
    assert.equal(user.balance, 0); assert.equal(product.salesCount, 1);
    assert.equal((await prisma.cardKey.findUniqueOrThrow({ where: { id: card.id } })).status, 'SOLD');
  } else {
    assert.equal(user.balance, 100); assert.equal(product.salesCount, 0);
    assert.equal(await prisma.order.count({ where: { userId: f.user.id } }), 0);
    assert.equal(await prisma.cardKey.count({ where: { id: card.id } }), 0);
  }
});

test("concurrent imports and card deletion keep available inventory consistent and invalidate caches", async () => {
  const f = await fixture(1);
  const card = await prisma.cardKey.findFirstOrThrow({ where: { productId: f.product.id } });
  await redis.set(`product:${f.product.slug}`, 'stale-cache'); await redis.set('products:list', 'stale-list');
  const results = await Promise.all([
    importCardKeys(f.product.id, ['SYNTHETIC-NEW-A', 'SYNTHETIC-NEW-B']),
    importCardKeys(f.product.id, ['SYNTHETIC-NEW-C']),
    changeUnsoldCardKey(card.id, { updatedAt: card.updatedAt.toISOString() }, 'delete'),
  ]);
  assert.equal(results[0], 2); assert.equal(results[1], 1);
  assert.equal(await prisma.cardKey.count({ where: { productId: f.product.id, status: 'AVAILABLE' } }), 3);
  const product = await prisma.product.findUniqueOrThrow({ where: { id: f.product.id } });
  assert.equal(product.stock, 3); assert.equal(product.salesCount, 0);
  assert.equal(await redis.exists(`product:${f.product.slug}`), 0); assert.equal(await redis.exists('products:list'), 0);
});

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


test("failed reset delivery removes its token; successful delivery keeps one expiring token", async context => {
  const names = ["SMTP_HOST", "SMTP_PORT", "SMTP_USER", "SMTP_PASS", "MAIL_FROM", "NEXT_PUBLIC_SITE_URL"];
  const previous = Object.fromEntries(names.map(name => [name, process.env[name]]));
  const email = `${prefix}-reset@example.invalid`;
  const user = await prisma.user.create({ data: { email } });
  const before = new Set(await redis.keys("reset_password:*"));
  let resetToken = "";
  let closeCount = 0;
  let fail = true;
  const mailMock = context.mock.method(nodemailer, "createTransport", () => ({
    sendMail: async (message: { html: string }) => {
      resetToken = message.html.match(/token=([a-f0-9]{64})/)![1];
      if (fail) throw Object.assign(new Error("private-mail-response"), { code: "ESOCKET", command: "CONN" });
      return {};
    },
    close: () => { closeCount++; },
  }) as unknown as ReturnType<typeof nodemailer.createTransport>);
  context.mock.method(console, "warn", () => {});
  const request = (value: string) => new NextRequest("http://localhost/api/auth/forgot-password", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: value }),
  });
  try {
    Object.assign(process.env, { SMTP_HOST: "smtp.example.com", SMTP_PORT: "465", SMTP_USER: "sender@example.com", SMTP_PASS: "test-only-mail-secret", MAIL_FROM: "sender@example.com", NEXT_PUBLIC_SITE_URL: "http://localhost" });
    const failed = await requestPasswordReset(request(email));
    assert.equal(failed.status, 503);
    assert(!JSON.stringify(await failed.json()).includes("private-mail-response"));
    assert.equal(await redis.exists(resetTokenKey(resetToken)), 0);
    fail = false;
    const successful = await requestPasswordReset(request(email));
    assert.equal(successful.status, 200);
    assert.deepEqual(JSON.parse((await redis.get(resetTokenKey(resetToken)))!), { userId: user.id, sessionVersion: user.sessionVersion });
    assert((await redis.ttl(resetTokenKey(resetToken))) <= 600);
    assert.equal(closeCount, 2);
    const tokenCount = (await redis.keys("reset_password:*")).filter(key => !before.has(key)).length;
    assert.equal(tokenCount, 1);
    const unknown = await requestPasswordReset(request(`${prefix}-absent-reset@example.invalid`));
    assert.equal(unknown.status, 200);
    assert.equal(closeCount, 2);
    process.env.SMTP_HOST = "";
    const missing = await requestPasswordReset(request(email));
    const missingUnknown = await requestPasswordReset(request(`${prefix}-absent-reset@example.invalid`));
    assert.equal(missing.status, 503);
    assert.equal(missingUnknown.status, 503);
    assert.deepEqual(await missing.json(), await missingUnknown.json());
  } finally {
    mailMock.mock.restore();
    for (const name of names) {
      if (previous[name] === undefined) delete process.env[name]; else process.env[name] = previous[name];
    }
    for (const key of await redis.keys("reset_password:*")) if (!before.has(key)) await redis.del(key);
  }
});

const resetRequest = (token: string, password = "test-new-password") => new NextRequest("http://localhost/api/auth/reset-password", {
  method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token, password }),
});
async function resetGrant(user: { id: string; sessionVersion: number }) {
  const token = randomBytes(32).toString("hex");
  await redis.setex(resetTokenKey(token), 600, JSON.stringify({ userId: user.id, sessionVersion: user.sessionVersion }));
  return token;
}

test("resetting a password revokes older links, rejects legacy grants and preserves password byte validation", async () => {
  const user = await prisma.user.create({ data: { email: `${prefix}-reset-revoke@example.invalid`, password: await bcrypt.hash("test-original", 4) } });
  const [older, newer] = await Promise.all([resetGrant(user), resetGrant(user)]);
  const invalid = await resetPassword(resetRequest(newer, "中".repeat(24) + "x"));
  assert.equal(invalid.status, 400);
  assert.equal(await redis.exists(resetTokenKey(newer)), 1);
  assert.equal((await resetPassword(resetRequest(newer))).status, 200);
  assert.equal((await verifyResetToken(resetRequest(older))).status, 200);
  assert.equal((await (await verifyResetToken(resetRequest(older))).json()).valid, false);
  assert.equal((await resetPassword(resetRequest(older, "test-attacker-password"))).status, 400);
  assert.equal((await resetPassword(resetRequest(newer))).status, 400);
  const saved = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
  assert.equal(saved.sessionVersion, 1);
  assert(await bcrypt.compare("test-new-password", saved.password!));
  const legacy = randomBytes(32).toString("hex");
  await redis.setex(`reset_password:${legacy}`, 600, user.id);
  assert.equal((await resetPassword(resetRequest(legacy))).status, 400);
  await redis.del(`reset_password:${legacy}`);
});

test("concurrent different reset tokens allow only one password update; ban and failures never authorize reset", async context => {
  const user = await prisma.user.create({ data: { email: `${prefix}-reset-race@example.invalid` } });
  const tokens = await Promise.all([resetGrant(user), resetGrant(user)]);
  const results = await Promise.all(tokens.map((token, index) => resetPassword(resetRequest(token, `test-password-${index}`))));
  assert.deepEqual(results.map(result => result.status).sort(), [200, 400]);
  const saved = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
  assert.equal(saved.sessionVersion, 1);
  const winner = results.findIndex(result => result.status === 200);
  assert(await bcrypt.compare(`test-password-${winner}`, saved.password!));
  const bannedToken = await resetGrant(saved);
  await prisma.user.update({ where: { id: user.id }, data: { status: "BANNED", sessionVersion: { increment: 1 } } });
  assert.equal((await resetPassword(resetRequest(bannedToken))).status, 400);
  const active = await prisma.user.update({ where: { id: user.id }, data: { status: "ACTIVE" } });
  const failedToken = await resetGrant(active);
  const originalUpdate = prisma.user.updateMany;
  prisma.user.updateMany = (async () => { throw new Error("Synthetic database failure"); }) as typeof originalUpdate;
  context.mock.method(console, "error", () => {});
  try { assert.equal((await resetPassword(resetRequest(failedToken))).status, 500); }
  finally { prisma.user.updateMany = originalUpdate; }
  assert.equal((await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).password, saved.password);
  assert.equal((await resetPassword(resetRequest(failedToken))).status, 400);
  const expired = await resetGrant(active);
  await redis.expire(resetTokenKey(expired), 0);
  assert.equal((await resetPassword(resetRequest(expired))).status, 400);
});

test("pending order quota is atomic across different products and releases on payment, cancellation and expiry", async () => {
  const previous = { orders: process.env.MAX_PENDING_ORDERS, quantity: process.env.MAX_PENDING_QUANTITY };
  process.env.MAX_PENDING_ORDERS = "3"; process.env.MAX_PENDING_QUANTITY = "100";
  try {
    const fixtures = await Promise.all(Array.from({ length: 4 }, () => fixture(4)));
    const buyer = fixtures[0].user;
    const input = (index: number) => ({ ...fixtures[index].input, userId: buyer.id, email: `${prefix}-quota-${index}@example.invalid` });
    await createOrder(input(0)); await createOrder(input(1));
    const attempts = await Promise.allSettled([createOrder(input(2)), createOrder(input(3))]);
    assert.equal(attempts.filter(result => result.status === "fulfilled").length, 1);
    const rejected = attempts.find(result => result.status === "rejected") as PromiseRejectedResult;
    assert(httpStatus(429)(rejected.reason));
    assert.equal(rejected.reason.code, "PENDING_ORDER_LIMIT");
    let orders = await prisma.order.findMany({ where: { userId: buyer.id, status: "PENDING" }, orderBy: { createdAt: "asc" } });
    assert.equal(orders.length, 3);
    assert.equal(await prisma.cardKey.count({ where: { productId: { in: fixtures.map(f => f.product.id) }, status: "LOCKED" } }), 3);
    await cancelOrder(orders[0].id);
    await createOrder(input(0));
    await handlePaymentSuccess(orders[1].orderNo, `${prefix}-quota-payment`, { method: "ALIPAY", amount: 100 });
    const replacement = await createOrder(input(1));
    await prisma.order.update({ where: { id: replacement.id }, data: { expiredAt: new Date(Date.now() - 1000) } });
    assert.equal(await cancelOrder(replacement.id, "过期", true), true);
    await createOrder(input(1));
    orders = await prisma.order.findMany({ where: { userId: buyer.id, status: "PENDING" } });
    assert.equal(orders.length, 3);
  } finally {
    if (previous.orders === undefined) delete process.env.MAX_PENDING_ORDERS; else process.env.MAX_PENDING_ORDERS = previous.orders;
    if (previous.quantity === undefined) delete process.env.MAX_PENDING_QUANTITY; else process.env.MAX_PENDING_QUANTITY = previous.quantity;
  }
});

test("quantity, email and trusted IP quotas cannot be bypassed by changing accounts; balance purchases remain available", async () => {
  const names = ["MAX_PENDING_ORDERS", "MAX_PENDING_QUANTITY", "TRUST_PROXY"];
  const previous = Object.fromEntries(names.map(name => [name, process.env[name]]));
  Object.assign(process.env, { MAX_PENDING_ORDERS: "3", MAX_PENDING_QUANTITY: "2", TRUST_PROXY: "true" });
  try {
    const ip = `2001:db8:${randomBytes(2).toString("hex")}:${randomBytes(2).toString("hex")}::1`;
    const f = await fixture(10, 1000);
    const order = await createOrder({ ...f.input, userId: undefined, quantity: 2, ip });
    await assert.rejects(createOrder({ ...f.input, ip: "192.0.2.11" }), httpStatus(429)); // Same email, another account/IP.
    await assert.rejects(createOrder({ ...f.input, email: `${prefix}-different@example.invalid`, ip }), httpStatus(429));
    assert.equal((await prisma.product.findUniqueOrThrow({ where: { id: f.product.id } })).stock, 8);
    await createOrder({ ...f.input, paymentMethod: "BALANCE", quantity: 1, ip });
    await cancelOrder(order.id);
    const allowed = await createOrder({ ...f.input, quantity: 2, ip });
    await cancelOrder(allowed.id);
    // Placeholder IPs must not turn a per-visitor rule into a site-wide quota.
    const a = await fixture(3); const b = await fixture(3);
    await createOrder({ ...a.input, quantity: 2, ip: "direct" });
    await createOrder({ ...b.input, quantity: 2, ip: "direct" });
  } finally {
    for (const name of names) if (previous[name] === undefined) delete process.env[name]; else process.env[name] = previous[name];
  }
});

test("concurrent buyers sharing a trusted IP cannot exceed the 100-card reservation quota across products", async () => {
  const names = ["MAX_PENDING_ORDERS", "MAX_PENDING_QUANTITY", "TRUST_PROXY"];
  const previous = Object.fromEntries(names.map(name => [name, process.env[name]]));
  Object.assign(process.env, { MAX_PENDING_ORDERS: "3", MAX_PENDING_QUANTITY: "100", TRUST_PROXY: "true" });
  try {
    const ip = `2001:db8:${randomBytes(2).toString("hex")}:${randomBytes(2).toString("hex")}::2`;
    const fixtures = await Promise.all([fixture(100), fixture(100)]);
    for (const f of fixtures) await prisma.product.update({ where: { id: f.product.id }, data: { maxQuantity: 100 } });
    const results = await Promise.allSettled(fixtures.map(f => createOrder({ ...f.input, quantity: 60, ip })));
    assert.equal(results.filter(result => result.status === "fulfilled").length, 1);
    assert(httpStatus(429)((results.find(result => result.status === "rejected") as PromiseRejectedResult).reason));
    const remaining = fixtures[results.findIndex(result => result.status === "rejected")];
    await createOrder({ ...remaining.input, quantity: 40, ip });
    assert.equal(await prisma.cardKey.count({ where: { productId: { in: fixtures.map(f => f.product.id) }, status: "LOCKED" } }), 100);
    await assert.rejects(createOrder({ ...remaining.input, quantity: 1, ip }), httpStatus(429));
  } finally {
    for (const name of names) if (previous[name] === undefined) delete process.env[name]; else process.env[name] = previous[name];
  }
});

test("actual callback routes reject tampering, duplicate parameters, oversized streams and transaction reuse", async () => {
  const names = ["XUNHU_ALIPAY_APPID", "XUNHU_ALIPAY_APPSECRET", "XUNHU_WECHAT_APPID", "XUNHU_WECHAT_APPSECRET"];
  const previous = Object.fromEntries(names.map(name => [name, process.env[name]]));
  const settings = await prisma.systemSetting.findMany({ where: { key: { in: ["alipayEnabled", "wechatEnabled"] } } });
  const secret = "test-only-callback-secret";
  Object.assign(process.env, { XUNHU_ALIPAY_APPID: "test-alipay", XUNHU_ALIPAY_APPSECRET: secret, XUNHU_WECHAT_APPID: "test-wechat", XUNHU_WECHAT_APPSECRET: "test-only-wechat-secret" });
  const signed = (data: Record<string, string>) => new URLSearchParams({ ...data, hash: createHash("md5").update(Object.keys(data).sort().filter(key => data[key] !== "").map(key => `${key}=${data[key]}`).join("&") + secret).digest("hex") }).toString();
  const invoke = (body: string, channel: "alipay" | "wechat" = "alipay") => handleXunhuCallback(new NextRequest(`http://localhost/api/payment/callback/${channel}`, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body }), channel);
  try {
    for (const key of ["alipayEnabled", "wechatEnabled"]) await prisma.systemSetting.upsert({ where: { key }, create: { key, value: "true" }, update: { value: "true" } });
    await redis.del("system:settings");
    const f = await fixture(2); const order = await createOrder(f.input);
    const data = { appid: "test-alipay", payment: "alipay", status: "OD", trade_order_id: order.orderNo, transaction_id: `${prefix}-route-receipt`, total_fee: "1.00" };
    const valid = signed(data);
    assert.equal((await invoke(valid.replace("total_fee=1.00", "total_fee=9.00"))).status, 400);
    assert.equal((await invoke(valid + "&total_fee=1.00")).status, 400);
    assert.equal((await invoke(signed({ ...data, total_fee: "0.01" }))).status, 400);
    assert.equal((await invoke(valid, "wechat")).status, 400);
    assert.equal((await invoke("x=" + "x".repeat(17000))).status, 413);
    assert.equal((await prisma.order.findUniqueOrThrow({ where: { id: order.id } })).status, "PENDING");
    assert.equal(await prisma.paymentReceipt.count({ where: { orderId: order.id } }), 0);
    const replies = await Promise.all([invoke(valid), invoke(valid)]);
    assert(replies.every(response => response.status === 200));
    assert.equal(await prisma.paymentReceipt.count({ where: { orderId: order.id } }), 1);
    assert.equal((await prisma.product.findUniqueOrThrow({ where: { id: f.product.id } })).salesCount, 1);
    const other = await createOrder(f.input);
    assert.equal((await invoke(signed({ ...data, trade_order_id: other.orderNo }))).status, 400);
    assert.equal((await prisma.order.findUniqueOrThrow({ where: { id: other.id } })).status, "PENDING");
    await prisma.systemSetting.update({ where: { key: "alipayEnabled" }, data: { value: "false" } }); await redis.del("system:settings");
    assert.equal((await invoke(valid)).status, 400);
  } finally {
    for (const key of ["alipayEnabled", "wechatEnabled"]) {
      const old = settings.find(row => row.key === key);
      if (old) await prisma.systemSetting.update({ where: { key }, data: { value: old.value } });
      else await prisma.systemSetting.deleteMany({ where: { key } });
    }
    await redis.del("system:settings");
    for (const name of names) if (previous[name] === undefined) delete process.env[name]; else process.env[name] = previous[name];
  }
});

test("USDT query only accepts exact confirmed contract transfers and refuses already claimed hashes", async context => {
  const f = await fixture(1);
  const order = await createOrder({ ...f.input, paymentMethod: "USDT_TRC20" });
  const address = "T" + "1".repeat(33);
  const quote = await prisma.paymentQuote.create({ data: { orderId: order.id, method: "USDT_TRC20", address, amountMicros: BigInt(1000123), exchangeRate: 7.2, expiresAt: order.expiredAt!, reservation: `${prefix}-chain-reservation` } });
  const hash = randomBytes(32).toString("hex");
  const transfer = { transaction_id: hash, token_info: { symbol: "USDT", address: "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t", decimals: 6, name: "Tether" }, block_timestamp: quote.createdAt.getTime(), from: "test-sender", to: address, type: "Transfer", value: "1000123" };
  let transfers = [{ ...transfer, value: "1000122" }, { ...transfer, token_info: { ...transfer.token_info, address: "fake-token" } }];
  let requests = 0;
  const mocked = context.mock.method(globalThis, "fetch", async (input: string | URL | Request) => {
    const url = new URL(String(input)); requests++;
    assert.equal(url.hostname, "api.trongrid.io");
    assert.equal(url.searchParams.get("only_confirmed"), "true");
    assert.equal(url.searchParams.get("contract_address"), transfer.token_info.address);
    return Response.json({ success: true, data: transfers });
  });
  try {
    assert.equal((await queryUSDTPayment(order.orderNo)).status, "pending");
    transfers = [transfer];
    assert.equal((await queryUSDTPayment(order.orderNo)).tradeNo, hash);
    await handlePaymentSuccess(order.orderNo, hash, { method: "USDT_TRC20", amount: 100 });
    const other = await fixture(1);
    const otherOrder = await createOrder({ ...other.input, paymentMethod: "USDT_TRC20" });
    await prisma.paymentQuote.create({ data: { orderId: otherOrder.id, method: "USDT_TRC20", address, amountMicros: quote.amountMicros, exchangeRate: 7.2, expiresAt: order.expiredAt!, createdAt: quote.createdAt, reservation: `${prefix}-chain-other` } });
    assert.equal((await queryUSDTPayment(otherOrder.orderNo)).status, "pending");
    const before = requests;
    await prisma.paymentQuote.update({ where: { orderId: otherOrder.id }, data: { expiresAt: new Date(0) } });
    assert.equal((await queryUSDTPayment(otherOrder.orderNo)).status, "pending");
    assert.equal(requests, before);
  } finally { mocked.mock.restore(); }
});

// Customer support uses the same isolated DB/Redis, never the shared local store.
test('support guest access slides 24h, members stay isolated, expired sessions never revive, expired guest access is rejected', async () => {
  const { createSupportConversation, getSupportConversation, getLatestSupportConversation, touchSupportConversation, setSupportFeedback, answerSupportTurn } = await import('../../src/lib/support/service');
  const a=await prisma.user.create({data:{email:`${prefix}-support-a@example.invalid`}});
  const b=await prisma.user.create({data:{email:`${prefix}-support-b@example.invalid`}});
  const guest={anonymousKey:randomBytes(32).toString('hex')};
  const own={...guest,userId:a.id}, other={...guest,userId:b.id};
  const g=await createSupportConversation(guest), member=await createSupportConversation(own);
  const stored=await prisma.supportConversation.findUniqueOrThrow({where:{id:member.id}});assert.equal(stored.anonymousKey,null);
  assert((stored.expiresAt.getTime()-Date.now())>29*86400000);
  const first=await prisma.supportConversation.findUniqueOrThrow({where:{id:g.id}});assert(Math.abs(first.expiresAt.getTime()-Date.now()-86400000)<3000);
  assert.equal(await getSupportConversation(member.id,guest),null);assert.equal(await getSupportConversation(member.id,other),null);
  assert.equal(await getSupportConversation(g.id,own),null);assert.equal((await getLatestSupportConversation(guest))?.id,g.id);
  await prisma.supportConversation.update({where:{id:g.id},data:{expiresAt:new Date(Date.now()+10000)}});
  await touchSupportConversation(g.id,guest);
  assert((await prisma.supportConversation.findUniqueOrThrow({where:{id:g.id}})).expiresAt.getTime()>Date.now()+86300000);
  const turn=await prisma.supportTurn.create({data:{conversationId:member.id,requestId:randomBytes(8).toString('hex'),userText:'私有问题',answerText:'私有回答'}});
  assert.equal(await setSupportFeedback(turn.id,1,guest),false);assert.equal(await setSupportFeedback(turn.id,1,other),false);assert.equal(await setSupportFeedback(turn.id,1,own),true);
  await prisma.supportConversation.update({where:{id:member.id},data:{expiresAt:new Date(Date.now()-1)}});
  assert.equal(await setSupportFeedback(turn.id,1,own),false);
  await assert.rejects(touchSupportConversation(member.id,own),/过期/);
  await assert.rejects(answerSupportTurn(member.id,'expired-request','你好',own),/过期/);
  await prisma.supportConversation.update({where:{id:g.id},data:{expiresAt:new Date(Date.now()-1)}});
  await assert.rejects(touchSupportConversation(g.id,guest),/过期/);
  assert.equal(await getLatestSupportConversation(guest),null);assert.equal(await getSupportConversation(g.id,guest),null);
  const newSession=await createSupportConversation(guest);assert.notEqual(newSession.id,g.id);
  await prisma.supportConversation.deleteMany({where:{id:{in:[g.id,member.id,newSession.id]}}});
  await prisma.user.deleteMany({where:{id:{in:[a.id,b.id]}}});
});

test('support retrieves latest messages beyond 20, summarizes older context, executes tools and records each request once', async t => {
  const { createSupportConversation, answerSupportTurn, getLatestSupportConversation, cleanupSupportData }=await import('../../src/lib/support/service');
  const { executeSupportTool }=await import('../../src/lib/support/tools');
  const identity={anonymousKey:randomBytes(32).toString('hex')};
  const c=await createSupportConversation(identity);
  const p=await prisma.product.create({data:{categoryId,name:'Claude Pro 会员 1个月',slug:`${prefix}-support-claude`,price:12900,stock:0,sort:-99999}});
  const envNames=['SUPPORT_LLM_API_KEY','SUPPORT_LLM_BASE_URL','SUPPORT_LLM_WIRE_API','SUPPORT_DAILY_BUDGET_CNY'];
  const saved=envNames.map(n=>process.env[n]);
  try {
    await prisma.supportTurn.createMany({data:Array.from({length:25},(_,i)=>({conversationId:c.id,requestId:`history-${i}`,userText:`旧问题${i}`,answerText:`旧回答${i}`,createdAt:new Date(Date.now()-60000+i*1000)}))});
    const current=await getLatestSupportConversation(identity);assert.equal(current?.turns.at(-1)?.userText,'旧问题24');
    const result=await executeSupportTool('search_products',{query:'Claude 5x'}) as any;
    assert.equal(result.exactMatches.length,0);assert(result.relatedProducts.some((r:any)=>r.name===p.name&&r.stock===0));
    const noResult=await executeSupportTool('search_products',{query:'nonexistent-unique-model-xyz'}) as any;assert.equal(noResult.exactMatches.length,0);assert.equal(noResult.relatedProducts.length,0);
    process.env.SUPPORT_LLM_API_KEY='synthetic-test-only';process.env.SUPPORT_LLM_BASE_URL='https://example.invalid/v1';process.env.SUPPORT_LLM_WIRE_API='responses';process.env.SUPPORT_DAILY_BUDGET_CNY='10000';
    let count=0;const bodies:any[]=[];
    t.mock.method(globalThis,'fetch',async (_url:unknown,init:any)=>{
      const body=JSON.parse(init.body);bodies.push(body);count++;
      const data=count===1?{output_text:JSON.stringify({decision:'allow',queries:[]})}:count===2?{output:[{type:'function_call',call_id:'products',name:'search_products',arguments:'{"query":"Claude 5x"}'},{type:'function_call',call_id:'knowledge',name:'search_knowledge',arguments:'{"query":"购买流程"}'}]}:{output_text:'当前未找到 Claude 5x，相关 Claude Pro 月付129元，当前缺货。'};
      return new Response(JSON.stringify({...data,usage:{input_tokens:20,output_tokens:10,total_tokens:30},model:'test'}));
    });
    const answer=await answerSupportTurn(c.id,'agent-request','Claude 5x多少钱？',identity);
    assert.equal(answer.status,'COMPLETED');assert.equal(count,3);assert(!('sources' in answer));assert(!('facts' in answer));
    const firstInput=JSON.stringify(bodies[0].input);assert(firstInput.includes('旧问题24'));assert(firstInput.includes('旧问题24'));assert(!firstInput.includes('priceCny'));
    assert(JSON.stringify(bodies[2].input).includes('priceCny'));
    const stored=await prisma.supportTurn.findUniqueOrThrow({where:{id:answer.turnId},include:{modelCalls:true}});
    assert.equal(stored.modelCalls.length,3);assert(stored.modelCalls.every(call=>call.totalTokens===30));assert((stored.sources as any[]).length>0);assert((stored.facts as any).queries.length===2);
    assert((await prisma.supportConversation.findUniqueOrThrow({where:{id:c.id}})).contextSummary.includes('旧问题13'));
    const replay=await answerSupportTurn(c.id,'agent-request','Claude 5x多少钱？',identity);assert.equal(replay.turnId,answer.turnId);assert.equal(count,3);
    // Distributed lock refuses concurrent messages without another paid request.
    await redis.set(`support:turn-lock:${c.id}`,'another-worker','EX',5);
    await assert.rejects(answerSupportTurn(c.id,'concurrent-request','另一个问题',identity),/正在回答/);
    await redis.del(`support:turn-lock:${c.id}`);
    await prisma.supportConversation.update({where:{id:c.id},data:{updatedAt:new Date(Date.now()-91*86400000),expiresAt:new Date(Date.now()-91*86400000)}});
    await prisma.supportTurn.updateMany({where:{conversationId:c.id},data:{createdAt:new Date(Date.now()-91*86400000)}});
    await cleanupSupportData();
    assert.equal(await getLatestSupportConversation(identity),null);
    assert.equal((await prisma.supportTurn.findUniqueOrThrow({where:{id:answer.turnId}})).answerText,null);
    assert.equal(await prisma.supportModelCall.count({where:{turnId:answer.turnId}}),3);
  } finally {
    envNames.forEach((name,i)=>{if(saved[i]===undefined)delete process.env[name];else process.env[name]=saved[i];});
    await prisma.supportConversation.delete({where:{id:c.id}});await prisma.product.delete({where:{id:p.id}});
  }
});

test('support attachments persist across replay and restore, hide QR URLs from model, and expire under automatic retention',async t=>{
  const {createSupportConversation,answerSupportTurn,getLatestSupportConversation,getSupportConversation,cleanupSupportData}=await import('../../src/lib/support/service');
  const identity={anonymousKey:randomBytes(32).toString('hex')};
  const c=await createSupportConversation(identity);
  const qr='https://res.cloudinary.com/demo/image/upload/test.webp';
  const prior=await prisma.systemSetting.findUnique({where:{key:'wechatSupportQrUrl'}});
  const keys=['SUPPORT_LLM_API_KEY','SUPPORT_LLM_BASE_URL','SUPPORT_LLM_WIRE_API','SUPPORT_DAILY_BUDGET_CNY'];const saved=keys.map(k=>process.env[k]);
  try {
    await prisma.systemSetting.upsert({where:{key:'wechatSupportQrUrl'},create:{key:'wechatSupportQrUrl',value:qr},update:{value:qr}});await redis.del('system:settings');
    process.env.SUPPORT_LLM_API_KEY='synthetic-test';process.env.SUPPORT_LLM_BASE_URL='https://example.invalid/v1';process.env.SUPPORT_LLM_WIRE_API='responses';process.env.SUPPORT_DAILY_BUDGET_CNY='10000';
    let requests=0;
    t.mock.method(globalThis,'fetch',async (_url:unknown,init:any)=>{
      requests++;const body=JSON.parse(init.body);
      if(requests===3){assert(!JSON.stringify(body.input).includes(qr));assert(JSON.stringify(body.input).includes('wechatQrConfigured'));}
      return new Response(JSON.stringify({usage:{input_tokens:10,output_tokens:10,total_tokens:20},...(requests===1?{output_text:JSON.stringify({decision:'allow',queries:[]})}:requests===2?{output:[{type:'function_call',name:'get_contacts',call_id:'contact-ui',arguments:'{}'},{type:'function_call',name:'get_navigation',call_id:'nav-ui',arguments:'{"page":"order_query"}'}]}:{output_text:'请扫描下方二维码，或点击订单查询按钮。'})}));
    });
    const result=await answerSupportTurn(c.id,'attachment-request','想找人工顺便查订单',identity);
    assert.equal(result.status,'COMPLETED');assert.equal(result.ui.images[0].url,qr);assert.equal(result.ui.links[0].href,'/order');
    assert(!('facts' in result));assert(!('sources' in result));assert.equal(requests,3);
    const replay=await answerSupportTurn(c.id,'attachment-request','想找人工顺便查订单',identity);assert.deepEqual(replay.ui,result.ui);assert.equal(requests,3);
    assert.deepEqual((await getLatestSupportConversation(identity))?.turns.at(-1)?.ui,result.ui);
    assert.deepEqual((await getSupportConversation(c.id,identity))?.turns.at(-1)?.ui,result.ui);
    await prisma.supportConversation.update({where:{id:c.id},data:{updatedAt:new Date(Date.now()-91*86400000),expiresAt:new Date(Date.now()-91*86400000)}});
    await prisma.supportTurn.updateMany({where:{conversationId:c.id},data:{createdAt:new Date(Date.now()-91*86400000)}});
    await cleanupSupportData();
    assert.equal((await prisma.supportTurn.findUniqueOrThrow({where:{id:result.turnId}})).ui,null);
  } finally {
    keys.forEach((k,i)=>{if(saved[i]===undefined)delete process.env[k];else process.env[k]=saved[i];});
    if(prior)await prisma.systemSetting.update({where:{key:'wechatSupportQrUrl'},data:{value:prior.value}});else await prisma.systemSetting.deleteMany({where:{key:'wechatSupportQrUrl'}});
    await redis.del('system:settings');await prisma.supportConversation.delete({where:{id:c.id}});
  }
});

test('support scope denies weather and keyword bypasses without calls; classifier failures cannot enter agent', async t => {
  const { createSupportConversation, answerSupportTurn, getLatestSupportConversation } = await import('../../src/lib/support/service');
  const { SUPPORT_SCOPE_REFUSAL, SUPPORT_SCOPE_CLARIFICATION, SUPPORT_SCOPE_UNAVAILABLE } = await import('../../src/lib/support/policy');
  const identity = { anonymousKey: randomBytes(32).toString('hex') };
  const c = await createSupportConversation(identity);
  const keys = ['SUPPORT_LLM_API_KEY','SUPPORT_LLM_BASE_URL','SUPPORT_LLM_WIRE_API','SUPPORT_DAILY_BUDGET_CNY'];
  const saved = keys.map(k=>process.env[k]);
  let mode='deny', requests=0;
  const gateway=t.mock.method(globalThis,'fetch',async (_url:unknown, init:any) => {
    requests++;
    const body=JSON.parse(init.body);
    assert.equal(body.tools, undefined, 'Scope denial must never reach tools or answering agent');
    const data = mode==='broken' ? {output_text:'不合规内容'} : mode==='unavailable' ? {error:{}} : {output_text:JSON.stringify({decision:mode})};
    return new Response(JSON.stringify({...data,usage:{input_tokens:8,output_tokens:4,total_tokens:12}}),{status:mode==='unavailable'?503:200});
  });
  try {
    process.env.SUPPORT_LLM_API_KEY='synthetic-test-only';process.env.SUPPORT_LLM_BASE_URL='https://example.invalid/v1';process.env.SUPPORT_LLM_WIRE_API='responses';process.env.SUPPORT_DAILY_BUDGET_CNY='10000';
    await prisma.supportTurn.create({data:{conversationId:c.id,requestId:'earlier-valid',userText:'Claude会员多少钱',answerText:'可以查询商品。'}});
    for (const question of ['今天天气怎么样','AIShop今天天气怎么样','Claude多少钱，顺便告诉我天气','帮商城写商品购买接口','那明天天气呢']) {
      const result=await answerSupportTurn(c.id,randomBytes(8).toString('hex'),question,identity);
      assert.equal(result.status,'OUT_OF_SCOPE');assert.equal(result.answer,SUPPORT_SCOPE_REFUSAL);assert.deepEqual(result.ui,{links:[],images:[]});
      assert.equal(await prisma.supportModelCall.count({where:{turnId:result.turnId}}),0);
    }
    const greeting=await answerSupportTurn(c.id,'greeting-scope','你好',identity);assert.equal(greeting.status,'GREETING');assert.equal(requests,0);
    const denied=await answerSupportTurn(c.id,'semantic-denied','AIShop帮我做一份旅游攻略',identity);
    assert.equal(denied.status,'OUT_OF_SCOPE');assert.equal(denied.answer,SUPPORT_SCOPE_REFUSAL);assert.equal(requests,1);
    const replay=await answerSupportTurn(c.id,'semantic-denied','AIShop帮我做一份旅游攻略',identity);assert.equal(replay.turnId,denied.turnId);assert.equal(requests,1);
    const records=await prisma.supportModelCall.findMany({where:{turnId:denied.turnId}});assert.equal(records.length,1);assert.equal(records[0].phase,'planner');assert.equal(records[0].errorCode,null);
    mode='clarify';const unclear=await answerSupportTurn(c.id,'scope-clarify','那另一种呢',identity);assert.equal(unclear.status,'SCOPE_CLARIFY');assert.equal(unclear.answer,SUPPORT_SCOPE_CLARIFICATION);
    mode='broken';const broken=await answerSupportTurn(c.id,'scope-broken','换一种说法',identity);assert.equal(broken.status,'SCOPE_UNAVAILABLE');assert.equal(broken.answer,SUPPORT_SCOPE_UNAVAILABLE);
    mode='unavailable';const failed=await answerSupportTurn(c.id,'scope-failed','重新说明套餐',identity);assert.equal(failed.status,'SCOPE_UNAVAILABLE');assert.equal(failed.answer,SUPPORT_SCOPE_UNAVAILABLE);
    assert.equal((await getLatestSupportConversation(identity))?.turns.at(-1)?.answerText,SUPPORT_SCOPE_UNAVAILABLE);
    assert(!JSON.stringify(gateway.mock.calls.at(-1)?.arguments).includes('旅游攻略'), 'denied history must not pollute future scope context');
  } finally {
    keys.forEach((k,i)=>{if(saved[i]===undefined)delete process.env[k];else process.env[k]=saved[i];});
    await prisma.supportConversation.delete({where:{id:c.id}});
  }
});

test('trusted FAQs skip all model calls with live facts and UI; mixed questions still require scope classification', async t=>{
  const {createSupportConversation,answerSupportTurn,getLatestSupportConversation}=await import('../../src/lib/support/service');
  const {SUPPORT_QUICK_QUESTIONS}=await import('../../src/lib/support/faq');
  const {getSupportFacts}=await import('../../src/lib/support/retriever');
  const identity={anonymousKey:randomBytes(32).toString('hex')};
  const c=await createSupportConversation(identity);
  const p=await prisma.product.create({data:{categoryId,name:'常见问题回归商品',slug:`${prefix}-faq`,price:1234,stock:3,sort:-99999}});
  const keys=['SUPPORT_LLM_API_KEY','SUPPORT_LLM_BASE_URL','SUPPORT_LLM_WIRE_API','SUPPORT_DAILY_BUDGET_CNY'];const saved=keys.map(k=>process.env[k]);
  const priorQr=await prisma.systemSetting.findUnique({where:{key:'wechatSupportQrUrl'}});
  const qr='https://example.com/faq-support.webp';
  let mode='503',calls=0;
  t.mock.method(globalThis,'fetch',async (_url:unknown,init:any)=>{
    calls++;assert.equal(JSON.parse(init.body).tools,undefined,'outage must not enter answering agent');
    if(mode==='timeout') throw new DOMException('test timeout','TimeoutError');
    if(mode==='deny') return new Response(JSON.stringify({output_text:'{"decision":"deny"}',usage:{input_tokens:8,output_tokens:4,total_tokens:12}}));
    if(mode==='invalid') return new Response(JSON.stringify({output_text:'malformed classification'}));
    return new Response(JSON.stringify({error:{type:'api_error'}}),{status:503});
  });
  try {
    process.env.SUPPORT_LLM_API_KEY='synthetic-test-only';process.env.SUPPORT_LLM_BASE_URL='https://example.invalid/v1';process.env.SUPPORT_LLM_WIRE_API='responses';process.env.SUPPORT_DAILY_BUDGET_CNY='10000';
    await prisma.systemSetting.upsert({where:{key:'wechatSupportQrUrl'},create:{key:'wechatSupportQrUrl',value:qr},update:{value:qr}});await redis.del('system:settings');
    const results=[];
    for(const question of SUPPORT_QUICK_QUESTIONS){
      const result=await answerSupportTurn(c.id,randomBytes(8).toString('hex'),question,identity);
      assert.equal(result.status,'FAQ');assert(!result.answer.includes('无法确认问题'));assert(!result.answer.includes('智能回答暂时不可用'));results.push(result);
    }
    assert.equal(calls,0);
    assert.equal(await prisma.supportModelCall.count({where:{turn:{conversationId:c.id}}}),0);
    assert.match(results[0].answer,/浏览商品/);assert(results[0].ui.links.some(l=>l.href==='/'));
    const facts=await getSupportFacts();
    if(facts.paymentMethods.length) assert(results[1].answer.includes(facts.paymentMethods.join('、')));else assert.match(results[1].answer,/未查询到可用支付方式/);
    assert(results[2].answer.includes('常见问题回归商品：有货（3 件）'));
    assert.match(results[3].answer,/订单详情/);assert(results[3].ui.links.some(l=>l.href==='/order'));
    assert(results[4].ui.links.some(l=>l.href==='/order'));assert.equal(results[5].ui.images[0].url,qr);
    await prisma.product.update({where:{id:p.id},data:{stock:0}});
    mode='timeout';const latest=await answerSupportTurn(c.id,'faq-timeout','哪些商品有库存？',identity);assert(!latest.answer.includes(p.name));assert(!latest.ui.links.some(l=>l.href===`/product/${p.slug}`));
    mode='invalid';assert.equal((await answerSupportTurn(c.id,'faq-invalid','支持哪些支付方式？',identity)).status,'FAQ');
    process.env.SUPPORT_DAILY_BUDGET_CNY='0';const before=calls;
    assert.equal((await answerSupportTurn(c.id,'faq-budget','怎么买商品？',identity)).status,'FAQ');assert.equal(calls,before);
    process.env.SUPPORT_DAILY_BUDGET_CNY='10000';mode='503';
    const unknown=await answerSupportTurn(c.id,'faq-unknown','支持哪些支付方式？另外做一份旅行计划',identity);assert.equal(unknown.status,'SCOPE_UNAVAILABLE');assert.deepEqual(unknown.ui,{links:[],images:[]});
    assert.equal((await answerSupportTurn(c.id,'faq-weather','支持哪些支付方式？今天天气如何',identity)).status,'OUT_OF_SCOPE');
    assert.equal(calls,1,'only the unrecognized mixed question reaches classification');
    mode='deny';assert.equal((await answerSupportTurn(c.id,'faq-denied','怎么买商品？另外帮我规划出游路线',identity)).status,'OUT_OF_SCOPE');
    mode='timeout';assert.equal((await answerSupportTurn(c.id,'unknown-timeout','帮我挑选一个适合我的会员',identity)).status,'SCOPE_UNAVAILABLE');
    mode='invalid';assert.equal((await answerSupportTurn(c.id,'unknown-invalid','帮我挑选一个适合我的会员',identity)).status,'SCOPE_UNAVAILABLE');
    assert.equal(calls,4);
    const alias=await answerSupportTurn(c.id,'faq-alias','如何购买商品',identity);assert.equal(alias.status,'FAQ');assert.equal(alias.answer,results[0].answer);assert.equal(calls,4);
    const replay=await answerSupportTurn(c.id,'faq-timeout','哪些商品有库存？',identity);assert.equal(replay.answer,latest.answer);assert.deepEqual(replay.ui,latest.ui);
    assert((await getLatestSupportConversation(identity))?.turns.some(t=>t.id===latest.turnId&&t.answerText===latest.answer));
  } finally {
    keys.forEach((k,i)=>{if(saved[i]===undefined)delete process.env[k];else process.env[k]=saved[i];});
    if(priorQr) await prisma.systemSetting.update({where:{key:'wechatSupportQrUrl'},data:{value:priorQr.value}});else await prisma.systemSetting.deleteMany({where:{key:'wechatSupportQrUrl'}});
    await redis.del('system:settings');await prisma.product.delete({where:{id:p.id}});await prisma.supportConversation.delete({where:{id:c.id}});
  }
});

test('available inventory filters zero stock before the result limit and excludes inactive products and categories', async () => {
  const {createSupportConversation,answerSupportTurn}=await import('../../src/lib/support/service');
  const {getSupportFacts}=await import('../../src/lib/support/retriever');
  const identity={anonymousKey:randomBytes(32).toString('hex')};
  const conversation=await createSupportConversation(identity);
  const slugPrefix=`${prefix}-availability`;
  const hiddenCategory=await prisma.category.create({data:{name:slugPrefix,slug:slugPrefix,isActive:false}});
  try {
    await prisma.product.createMany({data:[
      ...Array.from({length:51},(_,i)=>({categoryId,name:`缺货占位${i}`,slug:`${slugPrefix}-zero-${i}`,price:100,stock:0,sort:-100001})),
      {categoryId,name:'下架库存商品',slug:`${slugPrefix}-offline`,price:100,stock:3,isActive:false,sort:-100001},
      {categoryId:hiddenCategory.id,name:'隐藏分类库存商品',slug:`${slugPrefix}-hidden`,price:100,stock:3,sort:-100001},
      {categoryId,name:'可售库存商品',slug:`${slugPrefix}-available`,price:100,stock:3,sort:-100000},
    ]});
    const response=await answerSupportTurn(conversation.id,'available-first','哪些商品有库存？',identity);
    assert.equal(response.status,'FAQ');
    assert.match(response.answer,/可售库存商品：有货（3 件）/);
    assert.doesNotMatch(response.answer,/缺货占位|下架库存商品|隐藏分类库存商品/);
    assert(response.ui.links.some(l=>l.href===`/product/${slugPrefix}-available`));
    assert(!response.ui.links.some(l=>l.href.includes(slugPrefix)&&!l.href.endsWith('-available')));
    const stored=await prisma.supportTurn.findUniqueOrThrow({where:{id:response.turnId}});
    assert((stored.facts as any).products.every((p:any)=>p.stock>0));
    await prisma.product.update({where:{slug:`${slugPrefix}-available`},data:{isActive:false}});
    const hidden=await answerSupportTurn(conversation.id,'available-hidden','哪些商品有货',identity);
    assert(!hidden.answer.includes('可售库存商品'));
    assert(!hidden.ui.links.some(l=>l.href===`/product/${slugPrefix}-available`));
    await prisma.product.update({where:{slug:`${slugPrefix}-available`},data:{isActive:true,stock:0}});
    const empty=await answerSupportTurn(conversation.id,'available-zero','查看商品库存',identity);
    assert(!empty.answer.includes('可售库存商品'));
    // Direct product/price queries still need to distinguish an existing but sold-out SKU.
    assert((await getSupportFacts()).products.some(p=>p.slug.startsWith(`${slugPrefix}-zero-`)&&p.stock===0));
    assert.equal((await answerSupportTurn(conversation.id,'available-first','哪些商品有库存？',identity)).answer,response.answer);
    assert.equal(await prisma.supportModelCall.count({where:{turn:{conversationId:conversation.id}}}),0);
  } finally {
    await prisma.product.deleteMany({where:{slug:{startsWith:slugPrefix}}});
    await prisma.category.delete({where:{id:hiddenCategory.id}});
    await prisma.supportConversation.delete({where:{id:conversation.id}});
  }
});

test('support planner executes real tools in two calls; records identity, phase, cost and idempotent replay',async t=>{
  const {createSupportConversation,answerSupportTurn}=await import('../../src/lib/support/service');
  const identity={anonymousKey:randomBytes(32).toString('hex')},c=await createSupportConversation(identity);
  const keys=['SUPPORT_LLM_API_KEY','SUPPORT_LLM_BASE_URL','SUPPORT_DAILY_BUDGET_CNY'];const old=keys.map(k=>process.env[k]);
  await redis.del('support:v2:circuit');
  try{
    process.env.SUPPORT_LLM_API_KEY='synthetic-test';process.env.SUPPORT_LLM_BASE_URL='https://example.invalid/v1';process.env.SUPPORT_DAILY_BUDGET_CNY='10000';
    let calls=0;t.mock.method(globalThis,'fetch',async()=>new Response(JSON.stringify({output_text:++calls===1?JSON.stringify({decision:'allow',queries:[{name:'get_contacts',arguments:{}},{name:'get_navigation',arguments:{page:'order_query'}}]}):'请使用订单查询页面。',usage:{input_tokens:20,output_tokens:10,total_tokens:30}})));
    const r=await answerSupportTurn(c.id,'planned-request','想找人工顺便了解订单入口',identity,{value:'8.8.4.4',trusted:true});
    assert.equal(calls,2);assert.equal(r.status,'COMPLETED');assert(r.ui.links.some(l=>l.href==='/order'));
    const saved=await prisma.supportTurn.findUniqueOrThrow({where:{id:r.turnId},include:{modelCalls:{orderBy:{sequence:'asc'}}}});
    assert(saved.identityHash);assert.equal(saved.clientIp,'8.8.4.4');assert(saved.modelTurn);assert.deepEqual(saved.modelCalls.map(v=>v.phase),['planner','answer']);assert(saved.modelCalls.every(v=>v.accountingState==='SETTLED'&&v.rateSnapshot));
    assert.equal((await answerSupportTurn(c.id,'planned-request','同一请求重试',identity)).turnId,r.turnId);assert.equal(calls,2);
  }finally{keys.forEach((k,i)=>old[i]===undefined?delete process.env[k]:process.env[k]=old[i]);await prisma.supportConversation.delete({where:{id:c.id}});}
});

test('support budget reservations serialize competing calls, settle once and preserve unknown usage',async()=>{
  const {reserveSupportCall,reservationCost,settleSupportCall}=await import('../../src/lib/support/budget');
  const {getSupportConfig,dayStartShanghai}=await import('../../src/lib/support/config');
  const config={...await getSupportConfig(),dailyBudgetCny:10000};const day=dayStartShanghai();
  const c=await prisma.supportConversation.create({data:{anonymousKey:prefix+'budget',expiresAt:new Date(Date.now()+86400000)}});
  const turn=await prisma.supportTurn.create({data:{conversationId:c.id,requestId:'budget-call',userText:'预算测试'}});
  const prior=await prisma.systemSetting.findUnique({where:{key:'supportDailyBudgetCny'}});
  const start={phase:'answer' as const,body:{input:'test'},sequence:1,maxOutputTokens:1000};
  try{
    const balance=await prisma.supportBudgetDay.upsert({where:{day},create:{day},update:{}});
    const legacy=await prisma.supportModelCall.aggregate({where:{accountingState:'LEGACY',createdAt:{gte:day}},_sum:{estimatedCost:true}});
    const {Prisma}=await import('@prisma/client');
    const ceiling=balance.reservedCny.add(balance.settledCny).add(new Prisma.Decimal(String(legacy._sum.estimatedCost||0)).mul(config.usdCnyRate)).add(reservationCost(start,config));
    await prisma.systemSetting.upsert({where:{key:'supportDailyBudgetCny'},create:{key:'supportDailyBudgetCny',value:ceiling.toString()},update:{value:ceiling.toString()}});
    const results=await Promise.all(Array.from({length:6},()=>reserveSupportCall(turn.id,start,config)));
    assert.equal(results.filter(Boolean).length,1,'only one call fits the remaining budget');
    const reservation=results.find(Boolean)!;assert(reservation);
    const record={callId:reservation.callId,phase:'answer' as const,sequence:1,sent:true,latencyMs:10,success:true,usage:{inputTokens:10,outputTokens:5,totalTokens:15,cachedTokens:0,cacheWriteTokens:0,reasoningTokens:0,responseModel:'test'}};
    await Promise.all([settleSupportCall(record),settleSupportCall(record)]);
    const paid=await prisma.supportModelCall.findUniqueOrThrow({where:{id:reservation.callId}});assert(paid.settledCny!.lt(0.01));assert.equal(paid.accountingState,'SETTLED');
    await prisma.systemSetting.update({where:{key:'supportDailyBudgetCny'},data:{value:'10000'}});
    const missing=await reserveSupportCall(turn.id,{...start,sequence:2},config);assert(missing);
    await settleSupportCall({...record,callId:missing.callId,success:false,usage:{...record.usage,inputTokens:null,outputTokens:null,totalTokens:null}});
    const uncertain=await prisma.supportModelCall.findUniqueOrThrow({where:{id:missing.callId}});assert.equal(uncertain.accountingState,'UNCERTAIN');assert.equal(uncertain.estimatedCost,null);
    await prisma.systemSetting.update({where:{key:'supportDailyBudgetCny'},data:{value:'0'}});assert.equal(await reserveSupportCall(turn.id,start,config),false);
  }finally{if(prior)await prisma.systemSetting.update({where:{key:'supportDailyBudgetCny'},data:{value:prior.value}});else await prisma.systemSetting.deleteMany({where:{key:'supportDailyBudgetCny'}});await redis.del('system:settings');await prisma.supportConversation.delete({where:{id:c.id}});}
});

test('support atomic leases enforce identity/IP/global capacity and stale release cannot unlock a new request',async()=>{
  const {acquireSupportPermit,riskKeys}=await import('../../src/lib/support/risk');
  await redis.del('support:v2:circuit','support:v2:global');
  const releases:Array<()=>Promise<void>>=[],ip={value:'8.8.8.8',trusted:true};
  try{
    const same={anonymousKey:randomBytes(32).toString('hex')};const release=await acquireSupportPermit(same,ip,'一号问题');releases.push(release);
    await assert.rejects(acquireSupportPermit(same,{value:'1.1.1.1',trusted:true},'二号问题'),(e:any)=>e.code==='CONCURRENT');
    for(let i=0;i<2;i++)releases.push(await acquireSupportPermit({anonymousKey:randomBytes(32).toString('hex')},ip,`询问${i}`));
    await assert.rejects(acquireSupportPermit({anonymousKey:'excess-'+prefix},ip,'更多问题'),(e:any)=>e.code==='CONCURRENT');
    for(let i=0;i<5;i++)releases.push(await acquireSupportPermit({anonymousKey:randomBytes(32).toString('hex')},{value:`8.0.0.${i}`,trusted:true},'商品'));
    await assert.rejects(acquireSupportPermit({anonymousKey:prefix+'full'},{value:'9.9.9.9',trusted:true},'商品'),(e:any)=>e.code==='CONCURRENT');
    const keys=riskKeys(same,ip,'一号问题');for(const key of keys.slice(0,3)){const tokens=await redis.zrange(key,0,-1);for(const token of tokens)await redis.zadd(key,Date.now()-1,token);}
    const replacement=await acquireSupportPermit(same,ip,'不同问题');await release();assert.equal(await redis.zcard(keys[0]),1);await replacement();
  }finally{for(const release of releases)await release();}
});

test('support quotas, duplicates, cold circuit and manual bans stop generation; FAQ remains available',async()=>{
  const {acquireSupportPermit,riskKeys,recordModelOutcome,checkSupportCircuit}=await import('../../src/lib/support/risk');
  const {createSupportConversation,answerSupportTurn}=await import('../../src/lib/support/service');
  const {createSupportBlock,revokeSupportBlock}=await import('../../src/lib/support/admin');
  const ip={value:'1.0.0.1',trusted:true};await redis.del('support:v2:circuit');
  for(const member of [false,true]){
    const identity={anonymousKey:randomBytes(32).toString('hex'),...(member?{userId:prefix+'member'}:{})};const keys=riskKeys(identity,ip,'额度');
    await redis.set(keys[4],member?200:50,'EX',60);
    await assert.rejects(acquireSupportPermit(identity,ip,'额度'),(e:any)=>e.code==='DAILY_LIMIT');await redis.del(keys[4]);
    await redis.set(keys[3],member?10:5,'EX',60);for(let i=0;i<3;i++)await assert.rejects(acquireSupportPermit(identity,ip,'额度'));
    await redis.del(keys[3]);await assert.rejects(acquireSupportPermit(identity,ip,'额度'),(e:any)=>e.code==='COOLDOWN');
  }
  const identity={anonymousKey:randomBytes(32).toString('hex')};for(let i=0;i<3;i++)await(await acquireSupportPermit(identity,ip,'相同问题'))();
  await assert.rejects(acquireSupportPermit(identity,ip,'相同问题'),(e:any)=>e.code==='DUPLICATE_SPAM');
  for(let i=0;i<3;i++)await recordModelOutcome(true);await assert.rejects(checkSupportCircuit(),(e:any)=>e.code==='CIRCUIT');
  const c=await createSupportConversation(identity);const faq=await answerSupportTurn(c.id,'faq-still-free','怎么买商品？',identity,ip);assert.equal(faq.status,'FAQ');
  const block=await createSupportBlock({action:'block',source:'turn',id:faq.turnId,kind:'identity',reason:'test'},'test-admin');
  await redis.del('support:v2:circuit');await assert.rejects(acquireSupportPermit(identity,ip,'封禁后问题'),(e:any)=>e.code==='BLOCKED');
  await revokeSupportBlock(block.id,'test-admin');await redis.del(riskKeys(identity,ip,'商品')[7]);await(await acquireSupportPermit(identity,ip,'解封后新问题'))();
  await prisma.supportBlock.delete({where:{id:block.id}});await prisma.supportConversation.delete({where:{id:c.id}});
});

test('support full-range totals exceed 500, page boundaries are stable, and aged turns clear even in active conversations',async()=>{
  const {supportUsageSummary}=await import('../../src/lib/support/admin');const {cleanupSupportData}=await import('../../src/lib/support/service');
  const c=await prisma.supportConversation.create({data:{anonymousKey:prefix+'statistics',expiresAt:new Date(Date.now()+86400000)}});
  const turn=await prisma.supportTurn.create({data:{conversationId:c.id,requestId:prefix+'stats',userText:prefix+'统计',answerText:'回答',identityHash:'a'.repeat(64),clientIp:'8.8.8.8',clientIpTrusted:true}});
  await prisma.supportModelCall.createMany({data:Array.from({length:501},(_,i)=>({turnId:turn.id,provider:'test',requestModel:'test',sequence:i,inputTokens:10,outputTokens:5,totalTokens:15,usageStatus:'COMPLETE',estimatedCost:0.00001,success:true}))});
  try{
    const first=await supportUsageSummary({q:prefix+'统计',view:'calls',pageSize:100});const last=await supportUsageSummary({q:prefix+'统计',view:'calls',pageSize:100,page:6});
    assert.equal(first.summary.calls,501);assert.equal(first.summary.totalTokens,7515);assert.equal(first.items.length,100);assert.equal(last.items.length,1);assert(!last.hasMore);
    const missing=await prisma.supportTurn.create({data:{conversationId:c.id,requestId:'old-privacy',userText:'old private',answerText:'old answer',identityHash:'b'.repeat(64),clientIp:'9.9.9.9',createdAt:new Date(Date.now()-91*86400000)}});
    await prisma.supportConversation.update({where:{id:c.id},data:{contextSummary:'old private',updatedAt:new Date()}});
    assert.equal((await supportUsageSummary({q:'old private'})).total,0,'expired details stay hidden before the hourly cleanup runs');
    await cleanupSupportData();const old=await prisma.supportTurn.findUniqueOrThrow({where:{id:missing.id}});assert.equal(old.answerText,null);assert.equal(old.clientIp,null);assert.equal(old.identityHash,null);assert(old.clearedAt);
    assert.equal((await prisma.supportTurn.findUniqueOrThrow({where:{id:turn.id}})).answerText,'回答');assert.equal((await prisma.supportConversation.findUniqueOrThrow({where:{id:c.id}})).contextSummary,'');
  }finally{await prisma.supportConversation.delete({where:{id:c.id}});}
});

test('support account listing masks both views, full account search works, reveal audits and rejects unavailable data',async()=>{
  const {supportUsageSummary,revealSupportAccount}=await import('../../src/lib/support/admin');
  const user=await prisma.user.create({data:{email:`${prefix}-privacy@example.invalid`}});
  const c=await prisma.supportConversation.create({data:{userId:user.id,expiresAt:new Date(Date.now()+86400000)}});
  const guest=await prisma.supportConversation.create({data:{anonymousKey:prefix+'privacy',expiresAt:new Date(Date.now()+86400000)}});
  const turn=await prisma.supportTurn.create({data:{conversationId:c.id,requestId:'private',userText:'测试问题',clientIp:'203.0.113.8',clientIpTrusted:true}});
  const guestTurn=await prisma.supportTurn.create({data:{conversationId:guest.id,requestId:'guest-private',userText:'测试问题'}});
  await prisma.supportModelCall.create({data:{turnId:turn.id,provider:'test',requestModel:'test',sequence:1}});
  try {
    for(const view of ['turns','calls'] as const){
      const result=await supportUsageSummary({q:user.email!,view});
      assert.equal(result.total,1);assert(!JSON.stringify(result).includes(user.email!));
      const item=result.items[0];const dto='turn' in item?item.turn:item;
      assert.equal(dto.account,'te***@example.invalid');assert.equal(dto.canRevealAccount,true);
    }
    const focused=await supportUsageSummary({turnId:turn.id,view:'turns'});
    assert.equal(focused.total,1);assert.equal(focused.items[0].id,turn.id);assert('modelCalls' in focused.items[0]);assert.equal(focused.items[0].modelCalls.length,1);
    await prisma.supportTurn.update({where:{id:turn.id},data:{createdAt:new Date(Date.now()-10*86400000)}});
    const older=await supportUsageSummary({turnId:turn.id,view:'turns'});
    assert.equal(older.total,1);assert.equal(older.summary.calls,1);assert.equal(older.items[0].id,turn.id);
    assert.equal((await supportUsageSummary({turnId:'missing-record'})).total,0);
    assert.deepEqual(await revealSupportAccount(turn.id,prefix),{account:user.email});
    const {listSupportRisk}=await import('../../src/lib/support/admin');
    const risk=await listSupportRisk({pageSize:100});
    const reveal=risk.events.find((event:any)=>event.category==='ADMIN_ACCOUNT_REVEAL'&&event.details?.turnId===turn.id) as any;
    assert.equal(reveal.display.question,'测试问题');assert.equal(reveal.display.account,'te***@example.invalid');assert.equal(reveal.display.ip,'203.0.113.8');assert.equal(reveal.display.adminAccount,'管理员已删除');
    assert(!JSON.stringify(reveal).includes(user.email!));
    await prisma.supportTurn.update({where:{id:turn.id},data:{clientIpTrusted:false}});
    const untrusted=(await listSupportRisk({pageSize:100})).events.find(event=>event.id===reveal.id)!;
    assert.equal(untrusted.display.ip,null);
    const events=await prisma.supportRiskEvent.findMany({where:{category:'ADMIN_ACCOUNT_REVEAL',details:{path:['adminId'],equals:prefix}}});
    assert.equal(events.length,1);assert.deepEqual(events[0].details,{adminId:prefix,turnId:turn.id});
    assert(!JSON.stringify(events).includes(user.email!));
    for(const id of [guestTurn.id,'missing']) await assert.rejects(revealSupportAccount(id,prefix),(e:any)=>e.status===404);
    await prisma.supportTurn.update({where:{id:turn.id},data:{createdAt:new Date(Date.now()-91*86400000)}});
    await assert.rejects(revealSupportAccount(turn.id,prefix),(e:any)=>e.status===404);
    assert.equal((await supportUsageSummary({turnId:turn.id})).total,0);
    assert.deepEqual((await listSupportRisk({pageSize:100})).events.find(event=>event.id===reveal.id)!.display,{adminAccount:'管理员已删除',question:null,account:null,ip:null});
    await prisma.supportTurn.update({where:{id:turn.id},data:{createdAt:new Date(),clearedAt:new Date()}});
    await assert.rejects(revealSupportAccount(turn.id,prefix),(e:any)=>e.status===404);
    assert.equal((await supportUsageSummary({turnId:turn.id})).total,0);
    assert.deepEqual((await listSupportRisk({pageSize:100})).events.find(event=>event.id===reveal.id)!.display,{adminAccount:'管理员已删除',question:null,account:null,ip:null});
    assert.equal(await prisma.supportRiskEvent.count({where:{category:'ADMIN_ACCOUNT_REVEAL',details:{path:['adminId'],equals:prefix}}}),1);
  } finally {
    await prisma.supportRiskEvent.deleteMany({where:{category:'ADMIN_ACCOUNT_REVEAL',details:{path:['adminId'],equals:prefix}}});
    await prisma.supportConversation.deleteMany({where:{id:{in:[c.id,guest.id]}}});
    await prisma.user.delete({where:{id:user.id}});
  }
});

test('support visitor ID search matches displayed prefixes, copied labels and full hashes with consistent totals',async()=>{
  const {supportUsageSummary}=await import('../../src/lib/support/admin');
  const hash=randomBytes(32).toString('hex'),other=randomBytes(32).toString('hex');
  const c=await prisma.supportConversation.create({data:{anonymousKey:prefix+'guest-search',expiresAt:new Date(Date.now()+86400000)}});
  try{
    await prisma.supportTurn.createMany({data:[
      {conversationId:c.id,requestId:'guest-one',userText:'售前咨询',identityHash:hash,status:'FAQ'},
      {conversationId:c.id,requestId:'guest-two',userText:'售后咨询',identityHash:hash,status:'COMPLETED'},
      {conversationId:c.id,requestId:'guest-other',userText:'其他咨询',identityHash:other,status:'FAQ'},
      {conversationId:c.id,requestId:'guest-cleared',userText:'已清理',identityHash:hash,clearedAt:new Date()},
    ]});
    for(const q of [hash.slice(0,10),hash.slice(0,10).toUpperCase(),`游客 ${hash.slice(0,10)}`,hash]){
      const result=await supportUsageSummary({q});assert.equal(result.total,2);assert.equal(result.summary.turns,2);assert.equal(result.items.length,2);
      assert(result.items.every(item=>'identityHash' in item&&item.identityHash===hash));
    }
    const unmatched=await supportUsageSummary({q:randomBytes(32).toString('hex')});assert.equal(unmatched.total,0);
  }finally{await prisma.supportConversation.delete({where:{id:c.id}});}
});


test('configured support quotas apply without resetting counters and retention clears details before usage',async()=>{
  const {acquireSupportPermit,riskKeys}=await import('../../src/lib/support/risk');
  const {getSupportConfig}=await import('../../src/lib/support/config');
  const {clearSettingsCache}=await import('../../src/lib/services/settings.service');
  const {cleanupSupportData}=await import('../../src/lib/support/service');
  const {supportUsageSummary}=await import('../../src/lib/support/admin');
  const values={supportDetailRetentionDays:'2',supportUsageRetentionDays:'4',supportGuestDailyModelTurns:'2',supportMemberDailyModelTurns:'3',supportGuestPerMinute:'1',supportMemberPerMinute:'2'};
  const prior=await prisma.systemSetting.findMany({where:{key:{in:Object.keys(values)}}});
  const c=await prisma.supportConversation.create({data:{anonymousKey:prefix+'config',expiresAt:new Date(Date.now()+86400000)}});
  const ip={value:'8.8.4.4',trusted:true};
  try {
    await getSupportConfig(); // Warm the old cache, then update like the settings API.
    for(const [key,value] of Object.entries(values))await prisma.systemSetting.upsert({where:{key},create:{key,value},update:{value}});
    await clearSettingsCache();
    for(const member of [false,true]){
      const identity={anonymousKey:randomBytes(32).toString('hex'),...(member?{userId:prefix+'configured-member'}:{})};
      const keys=riskKeys(identity,ip,'限制测试');
      const daily=member?3:2,minute=member?2:1;
      await redis.set(keys[4],String(daily),'EX',60);
      await assert.rejects(acquireSupportPermit(identity,ip,'限制测试'),(e:any)=>e.code==='DAILY_LIMIT');
      await redis.del(keys[4]);await redis.set(keys[3],String(minute),'EX',60);
      await assert.rejects(acquireSupportPermit(identity,ip,'限制测试'),(e:any)=>e.code==='RATE_LIMIT');
      await redis.del(keys[3]);await(await acquireSupportPermit(identity,ip,'可通过问题'))();
      assert.equal(Number(await redis.get(keys[4])),1);
      await clearSettingsCache();assert.equal(Number(await redis.get(keys[4])),1);
      await redis.del(...keys.filter(k=>!['support:v2:global','support:v2:circuit'].includes(k)));
    }
    const now=new Date();const ids=[];
    for(const days of [1,3,5]){
      const createdAt=new Date(now.getTime()-days*86400000);
      const turn=await prisma.supportTurn.create({data:{conversationId:c.id,requestId:`retention-${days}`,userText:prefix+'retention',answerText:'回答',clientIp:'8.8.4.4',identityHash:'d'.repeat(64),createdAt}});
      ids.push(turn.id);await prisma.supportModelCall.create({data:{turnId:turn.id,provider:'test',requestModel:'test',createdAt}});
    }
    await cleanupSupportData(now);
    assert.equal((await prisma.supportTurn.findUniqueOrThrow({where:{id:ids[0]}})).answerText,'回答');
    const cleared=await prisma.supportTurn.findUniqueOrThrow({where:{id:ids[1]}});assert(cleared.clearedAt);assert.equal(cleared.answerText,null);assert.equal(cleared.identityHash,null);assert.equal(cleared.clientIp,null);
    assert.equal(await prisma.supportModelCall.count({where:{turnId:ids[1]}}),1);
    assert.equal(await prisma.supportTurn.count({where:{id:ids[2]}}),0);
    assert.equal(await prisma.supportModelCall.count({where:{turnId:ids[2]}}),0);
    const usage=await supportUsageSummary({q:prefix+'retention'});assert.equal(usage.detailRetentionDays,2);assert.equal(usage.usageRetentionDays,4);
  }finally{
    await prisma.systemSetting.deleteMany({where:{key:{in:Object.keys(values)}}});
    for(const row of prior)await prisma.systemSetting.create({data:{key:row.key,value:row.value}});
    await clearSettingsCache();await prisma.supportConversation.delete({where:{id:c.id}});
  }
});

test('retention protects call DTOs, searches, risk events and conversation replay before cleanup',async()=>{
  const {supportUsageSummary,listSupportRisk,createSupportBlock}=await import('../../src/lib/support/admin');
  const {getLatestSupportConversation,getSupportConversation,answerSupportTurn}=await import('../../src/lib/support/service');
  const {clearSettingsCache}=await import('../../src/lib/services/settings.service');
  const keys=['supportDetailRetentionDays','supportUsageRetentionDays'];
  const saved=await prisma.systemSetting.findMany({where:{key:{in:keys}}});
  const user=await prisma.user.create({data:{email:`${prefix}-expired@example.invalid`}});
  const oldDate=new Date(Date.now()-3*86400000),tooOld=new Date(Date.now()-6*86400000);
  const c=await prisma.supportConversation.create({data:{userId:user.id,createdAt:oldDate,title:'expired-title',contextSummary:'expired-summary',expiresAt:new Date(Date.now()+86400000)}});
  const old=await prisma.supportTurn.create({data:{conversationId:c.id,requestId:'expired-request',userText:'EXPIRED-QUESTION',answerText:'EXPIRED-ANSWER',identityHash:'f'.repeat(64),clientIp:'203.0.113.42',clientIpTrusted:true,createdAt:oldDate}});
  const oldCall=await prisma.supportModelCall.create({data:{turnId:old.id,provider:'test',requestModel:'test',createdAt:oldDate,inputTokens:5,outputTokens:2,totalTokens:7,usageStatus:'COMPLETE'}});
  const removedCall=await prisma.supportModelCall.create({data:{turnId:old.id,provider:'test',requestModel:'test',createdAt:tooOld}});
  const event=await prisma.supportRiskEvent.create({data:{category:'RATE_LIMIT',createdAt:oldDate,userId:user.id,identityHash:'f'.repeat(64),clientIp:'203.0.113.42'}});
  const identity={userId:user.id,anonymousKey:''};
  try {
    for(const [key,value] of [['supportDetailRetentionDays','2'],['supportUsageRetentionDays','5']])await prisma.systemSetting.upsert({where:{key},create:{key,value},update:{value}});
    await clearSettingsCache();
    const from=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).format(tooOld);
    const calls=await supportUsageSummary({from,view:'calls',pageSize:100});
    const item=calls.items.find(row=>row.id===oldCall.id);assert(item&&'turn' in item);
    const text=JSON.stringify(item);
    for(const secret of ['EXPIRED-QUESTION','EXPIRED-ANSWER','expired-request',c.id,user.id,user.email!,'f'.repeat(64),'203.0.113.42'])assert(!text.includes(secret),secret);
    assert.equal(item.totalTokens,7);assert.equal(item.turn.canRevealAccount,false);
    assert(!calls.items.some(row=>row.id===removedCall.id));
    for(const q of ['EXPIRED-QUESTION','expired-request','203.0.113.42',user.email!]){
      for(const view of ['turns','calls'] as const)assert.equal((await supportUsageSummary({from,q,view})).total,0);
    }
    assert(!(await listSupportRisk({pageSize:100})).events.some(row=>row.id===event.id));
    await assert.rejects(createSupportBlock({action:'block',source:'turn',id:old.id,kind:'ip',reason:'expired'},prefix));
    const restored=await getLatestSupportConversation(identity);assert.equal(restored?.title,null);assert.equal(restored?.turns.length,0);
    assert.equal((await getSupportConversation(c.id,identity))?.turns.length,0);
    await assert.rejects(answerSupportTurn(c.id,'expired-request','重试',identity),(e:any)=>e.status===410);
  }finally{
    await prisma.supportRiskEvent.deleteMany({where:{id:event.id}});
    await prisma.supportConversation.delete({where:{id:c.id}});await prisma.user.delete({where:{id:user.id}});
    await prisma.systemSetting.deleteMany({where:{key:{in:keys}}});
    for(const row of saved)await prisma.systemSetting.create({data:{key:row.key,value:row.value}});
    await clearSettingsCache();
  }
});

test('planner failures open the circuit; exhausted budget does not; FAQ stays available',async t=>{
  const {createSupportConversation,answerSupportTurn}=await import('../../src/lib/support/service');
  const {clearSettingsCache}=await import('../../src/lib/services/settings.service');
  const names=['SUPPORT_LLM_API_KEY','SUPPORT_LLM_BASE_URL','SUPPORT_LLM_WIRE_API'];const saved=names.map(k=>process.env[k]);
  const budget=await prisma.systemSetting.findUnique({where:{key:'supportDailyBudgetCny'}});
  const conversations:string[]=[];let requests=0;
  t.mock.method(globalThis,'fetch',async()=>{requests++;return new Response(JSON.stringify({error:{}}),{status:503});});
  async function ask(index:number,question='请介绍会员套餐'){
    const identity={anonymousKey:randomBytes(32).toString('hex')};const c=await createSupportConversation(identity);conversations.push(c.id);
    return answerSupportTurn(c.id,`circuit-review-${index}`,question,identity,{value:'8.8.4.4',trusted:true});
  }
  try{
    process.env.SUPPORT_LLM_API_KEY='synthetic';process.env.SUPPORT_LLM_BASE_URL='https://example.invalid/v1';process.env.SUPPORT_LLM_WIRE_API='responses';
    await prisma.systemSetting.upsert({where:{key:'supportDailyBudgetCny'},create:{key:'supportDailyBudgetCny',value:'0'},update:{value:'0'}});await clearSettingsCache();
    for(let i=0;i<3;i++)assert.equal((await ask(i)).status,'FALLBACK_BUDGET');
    assert.equal(requests,0);assert.equal(await redis.exists('support:v2:circuit'),0);
    await prisma.systemSetting.update({where:{key:'supportDailyBudgetCny'},data:{value:'10000'}});
    for(let i=3;i<6;i++)assert.equal((await ask(i)).status,'SCOPE_UNAVAILABLE');
    assert.equal(requests,3);
    await assert.rejects(ask(6),(e:any)=>e.code==='CIRCUIT');assert.equal(requests,3);
    assert.equal((await ask(7,'怎么买商品？')).status,'FAQ');assert.equal(requests,3);
  }finally{
    names.forEach((k,i)=>saved[i]===undefined?delete process.env[k]:process.env[k]=saved[i]);
    await prisma.supportConversation.deleteMany({where:{id:{in:conversations}}});
    if(budget)await prisma.systemSetting.update({where:{key:budget.key},data:{value:budget.value}});else await prisma.systemSetting.deleteMany({where:{key:'supportDailyBudgetCny'}});
    await clearSettingsCache();await redis.del('support:v2:circuit');
  }
});

// Observe a real DB lock waiter rather than relying on a guessed scheduling delay.
async function waitForAdvisoryWaiter() {
  for(let i=0;i<100;i++){
    const rows=await prisma.$queryRaw<Array<{waiting:boolean}>>`SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE datname=current_database() AND wait_event='advisory') AS waiting`;
    if(rows[0].waiting)return;
    await new Promise(resolve=>setTimeout(resolve,10));
  }
  throw new Error('Expected transaction to wait for advisory lock');
}

test('queued budget reservations read the new budget after acquiring the day lock',async()=>{
  const {reserveSupportCall}=await import('../../src/lib/support/budget');
  const {getSupportConfig,dayStartShanghai}=await import('../../src/lib/support/config');
  const saved=await prisma.systemSetting.findUnique({where:{key:'supportDailyBudgetCny'}});
  const config={...await getSupportConfig(),dailyBudgetCny:10000};
  const c=await prisma.supportConversation.create({data:{anonymousKey:prefix+'budget-queue',expiresAt:new Date(Date.now()+86400000)}});
  const turn=await prisma.supportTurn.create({data:{conversationId:c.id,requestId:'budget-queue',userText:'测试'}});
  let unlock!:()=>void,locked!:()=>void;const release=new Promise<void>(r=>unlock=r),ready=new Promise<void>(r=>locked=r);
  let reservation:Promise<unknown>|undefined;
  await prisma.systemSetting.upsert({where:{key:'supportDailyBudgetCny'},create:{key:'supportDailyBudgetCny',value:'10000'},update:{value:'10000'}});
  const writer=prisma.$transaction(async tx=>{
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`support-budget:${dayStartShanghai().toISOString()}`}))`;locked();await release;
    await tx.systemSetting.update({where:{key:'supportDailyBudgetCny'},data:{value:'0'}});
  });
  try{
    await ready;reservation=reserveSupportCall(turn.id,{phase:'answer',body:{input:'test'},sequence:1,maxOutputTokens:1000},config);
    await waitForAdvisoryWaiter();unlock();await writer;
    assert.equal(await reservation,false);assert.equal(await prisma.supportModelCall.count({where:{turnId:turn.id}}),0);
  }finally{
    unlock();await writer;await reservation;
    await prisma.supportConversation.delete({where:{id:c.id}});
    if(saved)await prisma.systemSetting.update({where:{key:saved.key},data:{value:saved.value}});else await prisma.systemSetting.deleteMany({where:{key:'supportDailyBudgetCny'}});
    await redis.del('system:settings');
  }
});

test('cleanup reads retention after config commits while holding the same lock',async()=>{
  const {cleanupSupportData}=await import('../../src/lib/support/service');
  const {SUPPORT_CONFIG_LOCK}=await import('../../src/lib/support/policy-store');
  const key='supportDetailRetentionDays',saved=await prisma.systemSetting.findUnique({where:{key}});
  await prisma.systemSetting.upsert({where:{key},create:{key,value:'2'},update:{value:'2'}});
  const c=await prisma.supportConversation.create({data:{anonymousKey:prefix+'cleanup-queue',expiresAt:new Date(Date.now()+86400000)}});
  const turn=await prisma.supportTurn.create({data:{conversationId:c.id,requestId:'cleanup-queue',userText:'must remain',createdAt:new Date(Date.now()-3*86400000)}});
  let unlock!:()=>void,locked!:()=>void;const release=new Promise<void>(r=>unlock=r),ready=new Promise<void>(r=>locked=r);
  let cleanup:Promise<unknown>|undefined;
  const writer=prisma.$transaction(async tx=>{await tx.$executeRaw`SELECT pg_advisory_xact_lock(${SUPPORT_CONFIG_LOCK})`;locked();await release;await tx.systemSetting.update({where:{key},data:{value:'10'}});});
  try{
    await ready;cleanup=cleanupSupportData();await waitForAdvisoryWaiter();unlock();await writer;await cleanup;
    assert.equal((await prisma.supportTurn.findUniqueOrThrow({where:{id:turn.id}})).userText,'must remain');
  }finally{
    unlock();await writer;await cleanup;await prisma.supportConversation.delete({where:{id:c.id}});
    if(saved)await prisma.systemSetting.update({where:{key},data:{value:saved.value}});else await prisma.systemSetting.deleteMany({where:{key}});
    await redis.del('system:settings');
  }
});

test('support cancellation stops real SQL even with the read pool exhausted and leaves reused connections intact', async t => {
  const url = new URL(process.env.DATABASE_URL!);
  url.searchParams.set('connection_limit', '1');
  const reader = new PrismaClient({ datasources: { db: { url: url.toString() } }, log: [] });
  let pid = 0;
  let marker = '';
  const controller = new AbortController();
  const outcome = withSupportDbAbort(controller.signal, async tx => {
    const [row] = await tx.$queryRaw<Array<{pid: number; marker: string}>>`SELECT pg_backend_pid() AS pid, current_setting('application_name') AS marker`;
    pid = row.pid; marker = row.marker;
    await tx.$queryRaw`SELECT 1 AS ok FROM pg_sleep(5)`;
    return true;
  }, reader).then(value => ({value, error: undefined}), error => ({value: undefined, error}));
  try {
    let active = false;
    for (let i = 0; i < 100 && !active; i++) {
      const rows = await prisma.$queryRaw<Array<{wait_event: string}>>`SELECT wait_event FROM pg_stat_activity WHERE pid=${pid}::int`;
      active = rows.some(row => row.wait_event === 'PgSleep');
      if (!active) await new Promise(resolve => setTimeout(resolve, 20));
    }
    assert(active, 'probe SQL must be running before abort');
    const cancelledAt = Date.now();
    controller.abort();
    const result = await outcome;
    const elapsed = Date.now() - cancelledAt;
    t.diagnostic(`PostgreSQL query settled ${elapsed}ms after abort with a saturated one-connection reader pool`);
    assert(result.error, 'cancelled operation must reject');
    assert(elapsed < 2000, `cancellation took ${elapsed}ms; must beat the 3s SQL timeout and 5s sleep`);
    const activeRows = await prisma.$queryRaw<Array<{pid:number}>>`SELECT pid FROM pg_stat_activity WHERE pid=${pid}::int AND application_name=${marker}`;
    assert.equal(activeRows.length, 0, 'transaction-local marker must be cleared before completion');
    const normal = await reader.$queryRaw<Array<{ok:number; pid:number; marker:string}>>`SELECT 1 AS ok, pg_backend_pid() AS pid, current_setting('application_name') AS marker FROM pg_sleep(0.2)`;
    assert.equal(normal[0].ok, 1);
    assert.equal(normal[0].pid, pid, 'the same pooled connection remains reusable');
    assert.notEqual(normal[0].marker, marker);
    // A completed read must detach its abort listener before the next query uses the connection.
    const completed = new AbortController();
    await withSupportDbAbort(completed.signal, tx => tx.$queryRaw`SELECT 1`, reader);
    completed.abort();
    await reader.$queryRaw`SELECT 1 FROM pg_sleep(0.2)`;
  } finally {
    controller.abort(); await outcome; await reader.$disconnect();
  }
});

async function cancellationChannelForTest() {
  const controller = new AbortController();
  await withSupportDbAbort(controller.signal, async tx => {
    controller.abort();
    return tx.$queryRaw`SELECT 1`;
  }).catch(() => {});
  const channel = (globalThis as unknown as {supportCancellationClient: PrismaClient}).supportCancellationClient;
  assert(channel);
  return channel;
}

test('support SQL timeout bounds reads if the cancel channel is unavailable, and reads cannot write', async t => {
  const channel = await cancellationChannelForTest();
  t.mock.method(channel, '$queryRaw', () => Promise.reject(new Error('synthetic cancel channel failure')));
  let started!: () => void;
  const ready = new Promise<void>(resolve => { started = resolve; });
  const controller = new AbortController();
  const began = Date.now();
  const outcome = withSupportDbAbort(controller.signal, async tx => {
    started();
    return tx.$queryRaw`SELECT 1 FROM pg_sleep(5)`;
  }).then(() => null, error => error);
  await ready;
  // Allow SQL dispatch; channel failure must fall back to server statement_timeout.
  await new Promise(resolve => setTimeout(resolve, 100));
  controller.abort();
  const error = await outcome;
  assert(error);
  assert(Date.now() - began < 4500, 'server timeout must stop SQL without a working cancel channel');
  await assert.rejects(withSupportDbAbort(new AbortController().signal, tx => tx.$executeRaw`UPDATE "SystemSetting" SET value=value WHERE false`));
});

test('real support tool and settings entrypoints reject cancellation without default data or late results', async () => {
  const {executeSupportTool} = await import('../../src/lib/support/tools');
  const {getSettings} = await import('../../src/lib/services/settings.service');
  const cancelled = new AbortController(); cancelled.abort();
  for (const [name, args] of [['search_products', {query: ''}], ['search_knowledge', {query: '购买'}], ['get_contacts', {}], ['get_payment_methods', {}], ['get_my_orders', {}], ['get_announcements', {}], ['get_navigation', {page: 'products'}]] as const) {
    await assert.rejects(executeSupportTool(name, args, undefined, cancelled.signal));
  }
  await assert.rejects(getSettings(cancelled.signal));
  // Block the actual ORM product query, then abort it while waiting for a table lock.
  let locked!: () => void, release!: () => void;
  const ready = new Promise<void>(resolve => { locked = resolve; });
  const gate = new Promise<void>(resolve => { release = resolve; });
  const locker = prisma.$transaction(async tx => {
    await tx.$executeRaw`LOCK TABLE "Product" IN ACCESS EXCLUSIVE MODE`;
    locked(); await gate;
  }, {timeout: 10000});
  const controller = new AbortController();
  let pending: Promise<unknown> | undefined;
  try {
    await ready;
    pending = executeSupportTool('search_products', {query: ''}, undefined, controller.signal).then(() => null, error => error);
    let waiting = false;
    for (let i=0; i<30 && !waiting; i++) {
      const rows = await prisma.$queryRaw<Array<{pid:number}>>`SELECT pid FROM pg_stat_activity WHERE application_name LIKE 'support-read:%' AND wait_event_type='Lock'`;
      waiting = rows.length > 0;
      if (!waiting) await new Promise(resolve => setTimeout(resolve, 10));
    }
    assert(waiting, 'actual tool query must reach PostgreSQL');
    controller.abort();
    assert(await pending, 'cancelled tool must reject rather than return product data');
  } finally {
    controller.abort(); await pending; release(); await locker;
  }
  const result = await executeSupportTool('search_products', {query: ''}, undefined, new AbortController().signal) as {relatedProducts: unknown[]};
  assert(Array.isArray(result.relatedProducts), 'subsequent normal tools still succeed');
});

test('cancelled support turns hold their concurrency permit until tool cleanup settles', async t => {
  const {answerSupportTurn, createSupportConversation} = await import('../../src/lib/support/service');
  const {riskKeys} = await import('../../src/lib/support/risk');
  const ip = {value:'unknown',trusted:false};
  const identity = {anonymousKey: randomBytes(32).toString('hex')};
  const conversation = await createSupportConversation(identity);
  const keys = ['SUPPORT_LLM_API_KEY','SUPPORT_LLM_BASE_URL','SUPPORT_LLM_WIRE_API'];
  const saved = keys.map(key => process.env[key]);
  const channel = await cancellationChannelForTest();
  const originalCancel = channel.$queryRaw.bind(channel);
  let releaseCancel!: () => void, cancelled!: () => void, unlock!: () => void, locked!: () => void;
  const gate = new Promise<void>(resolve => {releaseCancel = resolve;});
  const aborted = new Promise<void>(resolve => {cancelled = resolve;});
  const lockGate = new Promise<void>(resolve => {unlock = resolve;});
  const ready = new Promise<void>(resolve => {locked = resolve;});
  const locker = prisma.$transaction(async tx => {
    await tx.$executeRaw`LOCK TABLE "Product" IN ACCESS EXCLUSIVE MODE`; locked(); await lockGate;
  }, {timeout:10000});
  const controller = new AbortController();
  let calls = 0;
  t.mock.method(globalThis, 'fetch', async () => {
    calls++;
    return new Response(JSON.stringify({output_text: JSON.stringify({decision:'allow', queries:[{name:'search_products',arguments:{query:'会员'}}]}), usage:{input_tokens:10,output_tokens:10,total_tokens:20}}));
  });
  t.mock.method(channel, '$queryRaw', async (...args: Parameters<typeof originalCancel>) => {
    cancelled(); await gate; return originalCancel(...args);
  });
  let pending: Promise<Awaited<ReturnType<typeof answerSupportTurn>>> | undefined;
  const leaseKey = riskKeys(identity, ip, '推荐适合我的会员')[0];
  try {
    await ready;
    process.env.SUPPORT_LLM_API_KEY='synthetic';process.env.SUPPORT_LLM_BASE_URL='https://example.invalid/v1';process.env.SUPPORT_LLM_WIRE_API='responses';
    pending=answerSupportTurn(conversation.id,'cancel-drain','推荐适合我的会员',identity,ip,controller.signal);
    let waiting = false;
    for (let i=0; i<50 && !waiting; i++) {
      const rows = await prisma.$queryRaw<Array<{pid:number}>>`SELECT pid FROM pg_stat_activity WHERE application_name LIKE 'support-read:%' AND wait_event_type='Lock'`;
      waiting = rows.length > 0;
      if (!waiting) await new Promise(resolve => setTimeout(resolve, 10));
    }
    assert(waiting, 'real service tool must reach the blocked product query');
    controller.abort(); await aborted;
    await new Promise(resolve => setTimeout(resolve, 50));
    assert.equal(await redis.zcard(leaseKey),1,'do not admit replacement work while an old query is cleaning up');
    releaseCancel(); const result = await pending;
    assert.equal(result.status,'CANCELLED');
    assert.equal(await redis.zcard(leaseKey),0);
    assert.equal(calls,1,'no answering model call after cancellation');
  } finally {
    controller.abort(); releaseCancel(); unlock(); await locker; await pending?.catch(()=>{});
    keys.forEach((key,i)=>saved[i]===undefined?delete process.env[key]:process.env[key]=saved[i]);
    await prisma.supportConversation.delete({where:{id:conversation.id}});
  }
});

test('support denied requests cannot mutate another conversation or an orphaned turn',async()=>{
  const {createSupportConversation,answerSupportTurn}=await import('../../src/lib/support/service');
  const owner={anonymousKey:randomBytes(32).toString('hex')},other={anonymousKey:randomBytes(32).toString('hex')};
  const c=await createSupportConversation(owner);
  const turn=await prisma.supportTurn.create({data:{conversationId:c.id,requestId:'orphaned-request',userText:'synthetic',status:'PROCESSING'}});
  try{
    await assert.rejects(answerSupportTurn(c.id,'orphaned-request','hello',other),(e:any)=>e.status===404);
    assert.deepEqual(await prisma.supportTurn.findUnique({where:{id:turn.id}}),turn);
    await assert.rejects(answerSupportTurn(c.id,'orphaned-request','hello',owner),(e:any)=>e.status===409);
    assert.deepEqual(await prisma.supportTurn.findUnique({where:{id:turn.id}}),turn);
    await redis.set(`support:turn-lock:${c.id}`,'test-locked','EX',30);
    await assert.rejects(answerSupportTurn(c.id,'orphaned-request','hello',other),(e:any)=>e.status===409);
    assert.deepEqual(await prisma.supportTurn.findUnique({where:{id:turn.id}}),turn);
  }finally{await redis.del(`support:turn-lock:${c.id}`);await prisma.supportConversation.delete({where:{id:c.id}});}
});

test('in-flight support completion cannot restore purged history after retention changes',async t=>{
  const {answerSupportTurn,cleanupSupportData}=await import('../../src/lib/support/service');
  const {clearSettingsCache}=await import('../../src/lib/services/settings.service');
  const keys=['supportDetailRetentionDays','supportUsageRetentionDays','supportDailyBudgetCny'];
  const prior=await prisma.systemSetting.findMany({where:{key:{in:keys}}});
  const envNames=['SUPPORT_LLM_API_KEY','SUPPORT_LLM_BASE_URL','SUPPORT_LLM_WIRE_API'];const oldEnv=envNames.map(k=>process.env[k]);
  const user=await prisma.user.create({data:{email:`${prefix}-cleanup-flight@example.invalid`}});
  const identity={userId:user.id,anonymousKey:''},marker='SYNTHETIC_PURGED_SUMMARY';
  const createdAt=new Date(Date.now()-3*86400000);
  const c=await prisma.supportConversation.create({data:{userId:user.id,createdAt,contextSummary:marker,title:marker,expiresAt:new Date(Date.now()+86400000)}});
  const oldTurn=await prisma.supportTurn.create({data:{conversationId:c.id,requestId:'old-flight',userText:marker,answerText:marker,createdAt}});
  let started!:()=>void,release!:()=>void;const ready=new Promise<void>(r=>started=r),gate=new Promise<void>(r=>release=r);
  const bodies:any[]=[];let pending:Promise<unknown>|undefined;
  t.mock.method(globalThis,'fetch',async(_url:unknown,init:any)=>{
    const body=JSON.parse(init.body);bodies.push(body);
    if(bodies.length===1){started();await gate;}
    return new Response(JSON.stringify({output_text:body.instructions?.includes('查询参数定义')?JSON.stringify({decision:'allow',queries:[]}):'新的商品回答',usage:{input_tokens:10,output_tokens:10,total_tokens:20}}));
  });
  try{
    for(const [key,value] of [['supportDetailRetentionDays','90'],['supportUsageRetentionDays','180'],['supportDailyBudgetCny','10000']])await prisma.systemSetting.upsert({where:{key},create:{key,value},update:{value}});
    await clearSettingsCache();process.env.SUPPORT_LLM_API_KEY='synthetic';process.env.SUPPORT_LLM_BASE_URL='https://example.invalid/v1';process.env.SUPPORT_LLM_WIRE_API='responses';
    pending=answerSupportTurn(c.id,'flight-request','介绍一下会员',identity);
    const rejection=assert.rejects(pending,(e:any)=>e.status===409&&e.code==='CONTEXT_EXPIRED');
    await ready;assert(JSON.stringify(bodies[0]).includes(marker));
    await prisma.systemSetting.update({where:{key:'supportDetailRetentionDays'},data:{value:'1'}});
    await cleanupSupportData();assert.equal((await prisma.supportConversation.findUniqueOrThrow({where:{id:c.id}})).contextSummary,'');
    release();await rejection;
    assert.equal(bodies.length,1,'no answering model call after context is purged');
    const purged=await prisma.supportConversation.findUniqueOrThrow({where:{id:c.id}});assert.equal(purged.contextSummary,'');assert.equal(purged.title,null);
    const failed=await prisma.supportTurn.findUniqueOrThrow({where:{conversationId_requestId:{conversationId:c.id,requestId:'flight-request'}}});assert.equal(failed.status,'FAILED');assert(!JSON.stringify(failed).includes(marker));
    await prisma.systemSetting.update({where:{key:'supportDetailRetentionDays'},data:{value:'90'}});
    const result=await answerSupportTurn(c.id,'fresh-request','会员有哪些选择',identity);assert.equal(result.status,'COMPLETED');
    assert(!JSON.stringify(bodies.slice(1)).includes(marker));
    assert((await prisma.supportTurn.findUniqueOrThrow({where:{id:oldTurn.id}})).clearedAt);
  }finally{
    release();await pending?.catch(()=>{});envNames.forEach((k,i)=>oldEnv[i]===undefined?delete process.env[k]:process.env[k]=oldEnv[i]);
    await prisma.supportConversation.delete({where:{id:c.id}});await prisma.user.delete({where:{id:user.id}});
    await prisma.systemSetting.deleteMany({where:{key:{in:keys}}});for(const row of prior)await prisma.systemSetting.create({data:{key:row.key,value:row.value}});await clearSettingsCache();
  }
});
