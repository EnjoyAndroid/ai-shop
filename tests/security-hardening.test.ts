import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { createRequire } from "node:module";
import nodemailer from "nodemailer";
import { encrypt, decrypt } from "../src/lib/encryption";
import { userPasswordSchema, adminPasswordSchema } from "../src/lib/password-rules";
import { importCardKeysSchema, registerSchema } from "../src/lib/validations";
import { readBoundedJson } from "../src/lib/request-body";
import { OrderRequestError } from "../src/lib/order-errors";
import { sendPaymentSuccessEmail } from "../src/lib/mail";
import { sendPaymentSuccessTelegram } from "../src/lib/telegram";
import { privateCommitMetadata, syntheticPullRequestMerge } from "../scripts/check-commit-metadata.mjs";

test("existing AES-GCM ciphertext stays compatible; repeated reads derive once and key changes invalidate the cache", context => {
  const previous = process.env.ENCRYPTION_KEY;
  const secret = crypto.randomBytes(32).toString("hex");
  process.env.ENCRYPTION_KEY = secret;
  // Independent fixture using the original format, not the implementation under test.
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv("aes-256-gcm", crypto.pbkdf2Sync(secret, "ai-shop-encryption-salt-v1", 100000, 32, "sha256"), iv);
  const content = Buffer.concat([cipher.update("SYNTHETIC-LEGACY-CARD"), cipher.final()]).toString("base64");
  const legacy = { content, iv: iv.toString("base64"), tag: cipher.getAuthTag().toString("base64") };
  const derive = context.mock.method(crypto, "pbkdf2Sync");
  try {
    for (let i = 0; i < 100; i++) assert.equal(decrypt(legacy), "SYNTHETIC-LEGACY-CARD");
    assert.equal(derive.mock.callCount(), 1);
    assert.equal(decrypt(encrypt("NEW-CARD")), "NEW-CARD");
    assert.equal(derive.mock.callCount(), 1);
    process.env.ENCRYPTION_KEY = crypto.randomBytes(32).toString("hex");
    assert.throws(() => decrypt(legacy));
    assert.equal(derive.mock.callCount(), 2);
    process.env.ENCRYPTION_KEY = secret;
    assert.equal(decrypt(legacy), "SYNTHETIC-LEGACY-CARD");
    assert.equal(derive.mock.callCount(), 3);
    assert.throws(() => decrypt({ ...legacy, tag: Buffer.alloc(16).toString("base64") }));
    delete process.env.ENCRYPTION_KEY;
    assert.throws(() => decrypt(legacy));
  } finally {
    if (previous === undefined) delete process.env.ENCRYPTION_KEY; else process.env.ENCRYPTION_KEY = previous;
  }
});

test("all new account passwords enforce the bcrypt byte boundary", () => {
  for (const password of ["x".repeat(72), "中".repeat(24), "😀".repeat(18)]) {
    assert(userPasswordSchema.safeParse(password).success);
    assert(adminPasswordSchema.safeParse(password).success);
    assert(registerSchema.safeParse({ email: "test@example.invalid", password }).success);
    assert(!userPasswordSchema.safeParse(password + "x").success);
    assert(!adminPasswordSchema.safeParse(password + "x").success);
    assert(!registerSchema.safeParse({ email: "test@example.invalid", password: password + "x" }).success);
  }
  assert(!userPasswordSchema.safeParse("1234567").success);
  assert(!adminPasswordSchema.safeParse("12345678901").success);
});

test("card imports cap count, single-key length and total bytes before encryption", () => {
  const parse = (cardKeys: string) => importCardKeysSchema.safeParse({ productId: "synthetic", cardKeys });
  assert.equal(importCardKeysSchema.parse({ productId: "synthetic", cardKeys: " key1\r\n\nkey2 " }).cardKeys.length, 2);
  assert(parse(Array(500).fill("test-key").join("\n")).success);
  assert(!parse(Array(501).fill("test-key").join("\n")).success);
  assert(!parse("x".repeat(10001)).success);
  assert(!parse(Array(100).fill("中".repeat(10000)).join("\n")).success);
  assert(!parse("\n \n").success);
});

test("bounded JSON rejects both declared and chunked oversized bodies", async () => {
  assert.deepEqual(await readBoundedJson(new Request("http://localhost", { method: "POST", body: '{"a":1}' }), 16), { a: 1 });
  const tooLarge = (error: unknown) => error instanceof OrderRequestError && error.status === 413;
  await assert.rejects(readBoundedJson(new Request("http://localhost", { method: "POST", headers: { "content-length": "100" }, body: "{}" }), 16), tooLarge);
  await assert.rejects(readBoundedJson(new Request("http://localhost", { method: "POST", body: JSON.stringify({ a: "x".repeat(30) }) }), 16), tooLarge);
});

test("notification templates escape product and card markup before sending", async context => {
  const names = ["SMTP_HOST", "SMTP_PORT", "SMTP_USER", "SMTP_PASS", "MAIL_FROM", "TELEGRAM_BOT_TOKEN", "TELEGRAM_CHAT_ID"];
  const previous = Object.fromEntries(names.map(name => [name, process.env[name]]));
  let mailHtml = "", telegram = "";
  context.mock.method(nodemailer, "createTransport", () => ({ sendMail: async (message: { html: string }) => { mailHtml = message.html; }, close() {} }) as unknown as ReturnType<typeof nodemailer.createTransport>);
  context.mock.method(globalThis, "fetch", async (_url: unknown, init: RequestInit) => { telegram = JSON.parse(init.body as string).text; return Response.json({ ok: true }); });
  try {
    Object.assign(process.env, { SMTP_HOST: "smtp.example.invalid", SMTP_PORT: "465", SMTP_USER: "test@example.invalid", SMTP_PASS: "test-password", MAIL_FROM: "test@example.invalid", TELEGRAM_BOT_TOKEN: "test-token", TELEGRAM_CHAT_ID: "test-chat" });
    const productName = '<b title="test">product & name</b>';
    const card = '<a href="https://example.invalid/">card</a>';
    assert(await sendPaymentSuccessEmail({ to: "test@example.invalid", orderNo: "test-order", totalAmount: 100, items: [{ productName, cardKeys: [card] }] }));
    assert(!mailHtml.includes(productName)); assert(!mailHtml.includes(card));
    assert(mailHtml.includes('&lt;a href=&quot;https://example.invalid/&quot;&gt;card&lt;/a&gt;'));
    assert(await sendPaymentSuccessTelegram({ orderNo: "test-order", email: "test@example.invalid", payAmount: 100, paymentMethod: "ALIPAY", items: [{ productName, quantity: 1, price: 100 }] }));
    assert(!telegram.includes(productName)); assert(telegram.includes('&lt;b title=&quot;test&quot;&gt;product &amp; name&lt;/b&gt;'));
  } finally {
    for (const name of names) if (previous[name] === undefined) delete process.env[name]; else process.env[name] = previous[name];
  }
});

test("braces retains glob behavior but rejects stack-exhaustion patterns", () => {
  const braces = createRequire(import.meta.url)("braces");
  assert.deepEqual(braces.expand("src/{app,lib}/**/*.{ts,tsx}"), ["src/app/**/*.ts", "src/app/**/*.tsx", "src/lib/**/*.ts", "src/lib/**/*.tsx"]);
  assert.deepEqual(braces.expand("{1..3}"), ["1", "2", "3"]);
  for (const char of ["{", "("]) {
    const pattern = char.repeat(5000) + "x";
    for (const method of ["parse", "compile", "expand", "stringify"]) {
      assert.throws(() => braces[method](pattern), (error: unknown) => error instanceof SyntaxError && error.message.includes("nesting exceeds"));
    }
  }
});

test("history identity checks reject private author and committer addresses without printing them", () => {
  const privateAddress = 'synthetic-person@' + 'mail.invalid';
  assert.deepEqual(privateCommitMetadata('abc123\tauthor@example.invalid\t123+dev@users.noreply.github.com'), []);
  const failures = privateCommitMetadata(`abc123\t${privateAddress}\t${privateAddress}`);
  assert.equal(failures.length, 2);
  assert(failures.some(value => value.includes('author')));
  assert(failures.some(value => value.includes('committer')));
  assert(failures.every(value => !value.includes(privateAddress)));
});

test("history ignores only an event-verified temporary PR merge while still checking its parents", () => {
  const base = 'a'.repeat(40), head = 'b'.repeat(40), merge = 'c'.repeat(40);
  const event = { pull_request: { merge_commit_sha: merge, base: { sha: base }, head: { sha: head } } };
  assert.equal(syntheticPullRequestMerge('pull_request', event, merge, [base, head], merge), merge);
  assert.equal(syntheticPullRequestMerge('pull_request', { pull_request: { ...event.pull_request, merge_commit_sha: null } }, merge, [base, head], merge), merge);
  for (const [name,sha,parents] of [['push', merge, [base,head]], ['pull_request',head,[base,head]], ['pull_request',merge,[head,base]], ['pull_request',merge,[base]], ['pull_request',merge,[base,head,merge]]] as const) {
    assert.equal(syntheticPullRequestMerge(name,event,sha,[...parents],merge), null);
  }
  assert.equal(syntheticPullRequestMerge('pull_request',{},merge,[base,head],merge),null);
  assert.equal(syntheticPullRequestMerge('pull_request',event,merge,[base,head],head),null);
  assert.equal(syntheticPullRequestMerge('pull_request',event,merge,[base,head],undefined),null);
  const address = 'synthetic-private@' + 'mail.invalid';
  const log = `${merge}\t${address}\t${address}\n${head}\t${address}\t123+dev@users.noreply.github.com`;
  const failures = privateCommitMetadata(log, merge);
  assert.equal(failures.length, 1); assert(failures[0].startsWith(head));
  assert.equal(privateCommitMetadata(log).length,3);
});
