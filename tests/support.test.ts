import test from "node:test";
import assert from "node:assert/strict";
import { redactSupportText, dayStartShanghai } from "../src/lib/support/config";
import { fallbackAnswer } from "../src/lib/support/service";

test("support transcript redaction removes customer identifiers and credentials", () => {
  const value = redactSupportText("邮箱 buyer@example.com，订单 AS123456789，密码: secret-value，token abcdef0123456789abcdef0123456789");
  assert.equal(value.includes("buyer@example.com"), false);
  assert.equal(value.includes("AS123456789"), false);
  assert.equal(value.includes("secret-value"), false);
  assert.equal(value.includes("abcdef0123456789abcdef0123456789"), false);
});

test("support budget day uses the Shanghai calendar date", () => {
  const start = dayStartShanghai(new Date("2026-10-23T16:30:00.000Z"));
  assert.equal(start.toISOString(), "2026-10-23T16:00:00.000Z");
});

test("inventory fallback answers from live product facts before broad knowledge matches", () => {
  const answer = fallbackAnswer("哪些商品有库存？", "知识1《退款政策》\n无关内容", {
    siteName: "AI Shop", paymentMethods: [],
    products: [{ name: "测试商品", slug: "test", priceCny: 9.9, stock: 3, minQuantity: 1, maxQuantity: 2, description: "" }],
    orders: [], contacts: { telegramUrl: "", wechatSupportText: "", wechatSupportQrUrl: "" }, announcements: [],
  });
  assert.match(answer, /测试商品/);
  assert.match(answer, /有货/);
  assert.doesNotMatch(answer, /退款政策/);
});
