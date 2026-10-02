import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { XunhuPayProvider, USDTProvider } from "../src/lib/payment";
import { requireSecret } from "../src/lib/security-config";
import { getClientIp } from "../src/lib/get-client-ip";
import { isMatchingTransfer, USDT_CONTRACT_ADDRESS } from "../src/lib/trongrid";
import { createOrderSchema, registerSchema, productSchema } from "../src/lib/validations";

function signature(data: Record<string, string>, secret: string) {
  return createHash("md5").update(Object.keys(data).sort().map(k => `${k}=${data[k]}`).join("&") + secret).digest("hex");
}

test("missing payment credentials reject otherwise valid signatures", async () => {
  const data = { status: "OD", trade_order_id: "test-order", transaction_id: "test-tx", total_fee: "1.00" };
  for (const channel of ["ALIPAY", "WECHAT"] as const) {
    delete process.env[`XUNHU_${channel}_APPID`]; delete process.env[`XUNHU_${channel}_APPSECRET`];
    const provider = new XunhuPayProvider(channel === "ALIPAY" ? "alipay" : "wechat");
    assert.equal((await provider.verifyCallback({ ...data, hash: signature(data, "") })).success, false);
  }
});

test("callback checks merchant, channel, fee format and signature", async () => {
  process.env.XUNHU_ALIPAY_APPID = "test-merchant";
  process.env.XUNHU_ALIPAY_APPSECRET = "test-only-payment-secret";
  const provider = new XunhuPayProvider("alipay");
  const data = { appid: "test-merchant", payment: "alipay", status: "OD", trade_order_id: "test-order", transaction_id: "test-tx", total_fee: "12.34" };
  const signed = (value: typeof data) => ({ ...value, hash: signature(value, process.env.XUNHU_ALIPAY_APPSECRET!) });
  assert.equal((await provider.verifyCallback(signed(data))).amount, 1234);
  for (const update of [{ appid: "different" }, { payment: "wechat" }, { total_fee: "12.34garbage" }, { total_fee: "0.00" }, { total_fee: "-1" }, { status: "pending" }]) {
    assert.equal((await provider.verifyCallback(signed({ ...data, ...update }))).success, false);
  }
  assert.equal((await provider.verifyCallback({ ...signed(data), total_fee: "123.40" })).success, false);
  assert.equal((await new USDTProvider().verifyCallback({ txHash: "untrusted" })).success, false);
});

test("mandatory secrets have no public fallback", () => {
  for (const value of [undefined, "admin-secret-key", "REPLACE_WITH_RANDOM_AUTH_SECRET", "your-super-secret-key-change-in-production"]) {
    if (value) process.env.NEXTAUTH_SECRET = value; else delete process.env.NEXTAUTH_SECRET;
    assert.throws(() => requireSecret("NEXTAUTH_SECRET"));
  }
  process.env.NEXTAUTH_SECRET = "0123456789abcdef".repeat(4);
  assert.equal(requireSecret("NEXTAUTH_SECRET").length, 64);
});

test("untrusted proxy headers cannot change the rate-limit identity", () => {
  const headers = new Headers({ "cf-connecting-ip": "1.2.3.4", "x-forwarded-for": "2.3.4.5", "x-real-ip": "10.0.0.1" });
  process.env.TRUST_PROXY = "false";
  assert.equal(getClientIp({ headers }), "direct");
  process.env.TRUST_PROXY = "true";
  assert.equal(getClientIp({ headers }), "10.0.0.1");
});

test("USDT requires exact atomic amount, contract, recipient and payment window", () => {
  const quote = { address: "test-recipient", amountMicros: BigInt(10001234), createdAt: new Date(1000), expiresAt: new Date(2000) };
  const transfer = { transaction_id: "a".repeat(64), token_info: { address: USDT_CONTRACT_ADDRESS, decimals: 6, symbol: "USDT", name: "Tether" }, block_timestamp: 1500, from: "sender", to: quote.address, type: "Transfer", value: "10001234" };
  assert.equal(isMatchingTransfer(transfer, quote), true);
  for (const update of [{ value: "10001235" }, { to: "other" }, { block_timestamp: 2001 }, { token_info: { ...transfer.token_info, address: "fake-USDT" } }]) assert.equal(isMatchingTransfer({ ...transfer, ...update }, quote), false);
});

test("fractional quantities and phone-only registrations are rejected", () => {
  assert.equal(createOrderSchema.safeParse({ items: [{ productId: "x", quantity: 1.5 }], email: "test@example.invalid", paymentMethod: "BALANCE" }).success, false);
  assert.equal(registerSchema.safeParse({ phone: "13800138000", password: "test-password" }).success, false);
});

test("product image edits allow an empty original price while required prices remain validated", () => {
  const product = { name: "商品", slug: "test-product", categoryId: "test-category", price: 19900, image: "https://res.cloudinary.com/demo/image/upload/test.webp" };
  assert.equal(productSchema.parse({ ...product, originalPrice: null }).originalPrice, null);
  assert.equal(productSchema.parse(product).originalPrice, undefined);
  assert.equal(productSchema.parse({ ...product, originalPrice: 0 }).originalPrice, 0);
  assert.equal(productSchema.parse({ ...product, originalPrice: 29900 }).originalPrice, 29900);
  assert.equal(productSchema.safeParse({ ...product, price: null }).success, false);
  assert.equal(productSchema.safeParse({ ...product, originalPrice: -1 }).success, false);
});
