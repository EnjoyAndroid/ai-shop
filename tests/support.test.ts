import test from "node:test";
import redis from "../src/lib/redis";
import { readFileSync } from "node:fs";
import { rankSupportKnowledge, type SupportKnowledgeArticle } from "../src/lib/support/retriever";
import assert from "node:assert/strict";
import { redactSupportText, dayStartShanghai, getSupportConfig } from "../src/lib/support/config";
import { fallbackAnswer, isSupportConversationAccessible, supportConversationScope, type SupportIdentity } from "../src/lib/support/service";
import { shouldSubmitSupportOnEnter } from "../src/lib/support/input";
import { SUPPORT_GREETING, SUPPORT_NAME, GUEST_SESSION_SECONDS } from "../src/lib/support/policy";
import { generateSupportAnswer } from "../src/lib/support/llm";

test("support transcript redaction removes customer identifiers and credentials", () => {
  const value = redactSupportText("邮箱 buyer@example.com，订单 AS123456789，密码: secret-value，token abcdef0123456789abcdef0123456789");
  assert.equal(value.includes("buyer@example.com"), false);
  assert.equal(value.includes("AS123456789"), false);
  assert.equal(value.includes("secret-value"), false);
  assert.equal(value.includes("abcdef0123456789abcdef0123456789"), false);
  assert.equal(redactSupportText("填写下单邮箱和订单查询密码，选择支付方式。"), "填写下单邮箱和订单查询密码，选择支付方式。");
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

test("available inventory answers exclude zero stock and explain empty availability", () => {
  const product = { name: "有货商品", slug: "available", priceCny: 9.9, stock: 2, minQuantity: 1, maxQuantity: 3, description: "" };
  const empty = { ...product, name: "零库存商品", slug: "empty", stock: 0 };
  const facts = { siteName: "AI Shop", paymentMethods: [], products: [product, empty], orders: [], contacts: { telegramUrl: "", wechatSupportText: "", wechatSupportQrUrl: "" }, announcements: [] };
  assert.equal(fallbackAnswer("哪些商品有库存？", "", facts), "有货商品：有货（2 件），售价 ¥9.90");
  for (const products of [[], [empty]]) {
    assert.equal(fallbackAnswer("哪些商品有货", "其他知识", { ...facts, products }), "当前暂无有库存的上架商品，请稍后再来查看。");
  }
});

test("product and contact questions use current business facts instead of generic knowledge", () => {
  const facts = {
    siteName: "AI Shop", paymentMethods: ["账户余额"],
    products: [{ name: "ChatGPT Plus 会员 1个月", slug: "chatgpt-plus-1month", priceCny: 99, stock: 4, minQuantity: 1, maxQuantity: 5, description: "" }],
    orders: [], contacts: { telegramUrl: "", wechatSupportText: "", wechatSupportQrUrl: "https://cdn.example.invalid/support.webp" }, announcements: [],
  };
  const price = fallbackAnswer("gpt plus多少钱一个月？", "", facts);
  assert.match(price, /ChatGPT Plus/); assert.match(price, /¥99\.00/); assert.match(price, /有货/);
  const missing = fallbackAnswer("Claude 5x多少钱？", "", { ...facts, products: [{ name: "Claude Pro 会员 1个月", slug: "claude-pro-1month", priceCny: 129, stock: 0, minQuantity: 1, maxQuantity: 3, description: "" }] });
  assert.match(missing, /没有找到/); assert.match(missing, /Claude Pro/); assert.match(missing, /缺货/);
  const contact = fallbackAnswer("如何联系客服？", "知识1《联系客服》\n静态文案", facts);
  assert.match(contact, /二维码已配置/); assert.doesNotMatch(contact, /知识1/);
});

test("IME candidate Enter confirms composition without submitting the support question", () => {
  assert.equal(shouldSubmitSupportOnEnter({ key: "Enter", shiftKey: false, keyCode: 229, nativeEvent: { isComposing: true } }), false);
  assert.equal(shouldSubmitSupportOnEnter({ key: "Enter", shiftKey: false, keyCode: 13, nativeEvent: { isComposing: true } }), false);
  assert.equal(shouldSubmitSupportOnEnter({ key: "Enter", shiftKey: false, keyCode: 13, nativeEvent: { isComposing: false } }), true);
  assert.equal(shouldSubmitSupportOnEnter({ key: "Enter", shiftKey: true, keyCode: 13, nativeEvent: { isComposing: false } }), false);
});

test("support agent understands context, calls a read-only tool, then answers", async () => {
  const requests: any[] = [];
  const answers = [
    {output_text:JSON.stringify({decision:"allow",queries:[]}),usage:{input_tokens:8,output_tokens:4,total_tokens:12}},
    { output: [{ type: "function_call", call_id: "call-1", name: "search_products", arguments: JSON.stringify({ query: "Claude 5x" }) }], usage: { input_tokens: 10, output_tokens: 5, total_tokens: 15 }, model: "test-model" },
    { output_text: "不好意思，店内暂时没有 Claude 5x。目前有 Claude Pro，售价 ¥129，但现在缺货。", usage: { input_tokens: 20, output_tokens: 18, total_tokens: 38 }, model: "test-model" },
  ];
  const answer = await generateSupportAnswer({
    question: "Claude 5x多少钱？", history: [{ role: "user", content: "我想了解 Claude" }, { role: "assistant", content: "请问你想了解哪个套餐？" }], summary: "用户正在咨询 Claude 会员。", config: { provider: "test", baseUrl: "https://example.invalid/v1", model: "test-model", wireApi: "responses", apiKey: "test", dailyBudgetCny: 10, usdCnyRate: 7.2, inputUsdPerMillion: 0.1, cachedInputUsdPerMillion: 0.01, cacheWriteUsdPerMillion: 0.125, outputUsdPerMillion: 0.5 },
    execute: async (name, args) => { assert.equal(name, "search_products"); assert.deepEqual(args, { query: "Claude 5x" }); return { exactMatches: [], relatedProducts: [{ name: "Claude Pro", priceCny: 129, stock: 0 }] }; },
    beforeCall: async () => true,
    recordCall: async call => { requests.push(call); },
    fetcher: async (_url, init) => { const body = JSON.parse(String(init?.body)); answers.length; const data = answers.shift()!; requests.push({ body }); return new Response(JSON.stringify(data), { status: 200, headers: { "Content-Type": "application/json" } }); },
  });
  assert.match(answer, /没有 Claude 5x/); assert.equal(requests.length, 6);
  assert.equal(SUPPORT_NAME, "小AI同学"); assert.equal(SUPPORT_GREETING, "您好，我是AIShop的智能客服小AI同学，请问有什么可以帮您？"); assert.equal(GUEST_SESSION_SECONDS, 86400);
});

// Use the shipped knowledge text rather than inventing a ranking-friendly corpus.
const seed = readFileSync(new URL("../prisma/seed.ts", import.meta.url), "utf8");
const articles = JSON.parse("[" + seed.split("const supportArticles = [")[1].split("\n  ];")[0]
  .replace(/(\w+):/g, '"$1":').replace(/,\s*$/, "") + "]") as SupportKnowledgeArticle[];
for (const article of articles) article.version = 1;
const facts = { siteName: "AI Shop", paymentMethods: ["账户余额"], products: [], orders: [], contacts: { telegramUrl: "", wechatSupportText: "", wechatSupportQrUrl: "" }, announcements: [] };

for (const [question, expected] of [
  ["怎么买商品？", "support-buying"], ["购买流程", "support-buying"],
  ["支付成功后怎么查看卡密？", "support-delivery"], ["支付成功后怎么查看卡密", "support-delivery"],
  ["付款后没看到卡密", "support-delivery"], ["怎么查询我的订单？", "support-order"],
  ["如何联系客服？", "support-contact"], ["卡密无法使用怎么办？", "support-invalid"],
  ["可以申请退款吗？", "support-refund"],
]) test(`published knowledge answers the actual question: ${question}`, () => {
  const knowledge = rankSupportKnowledge(question, articles);
  assert.equal(knowledge.sources[0]?.id, expected);
  assert.equal(fallbackAnswer(question, knowledge.answer, facts), articles.find(article => article.id === expected)!.content);
  assert.doesNotMatch(fallbackAnswer(question, knowledge.answer, facts), /知识\d+《|参考：/);
});

test("payment methods use current configuration while payment problems keep their knowledge answer", () => {
  for (const question of ["支持哪些支付方式？", "怎么付款", "充值方式有哪些？"]) {
    assert.match(fallbackAnswer(question, "过时的方式", facts), /当前可用支付方式：账户余额/);
  }
  for (const question of ["支付成功后怎么查看卡密？", "支付失败怎么办", "充值没到账", "能不能退款"]) {
    assert.equal(fallbackAnswer(question, "相关问题的处理说明", facts), "相关问题的处理说明");
  }
});

test("generic characters cannot retrieve unrelated knowledge; exact aliases exclude other articles", () => {
  assert.equal(rankSupportKnowledge("怎么？", articles).answer, "");
  assert.equal(rankSupportKnowledge("商品", articles).answer, "");
  assert.equal(rankSupportKnowledge("今天天气好吗？", articles).answer, "");
  assert.equal(rankSupportKnowledge("付款后没看到卡密", articles).sources.length, 1);
  assert.equal(rankSupportKnowledge("怎么买商品？", articles).sources.some(source => source.id === "support-refund"), false);
});

test("support conversation access stays isolated across login, logout, account switch, guest and expiry", () => {
  const guest: SupportIdentity = { anonymousKey: "a".repeat(64) };
  const accountA: SupportIdentity = { userId: "user-a", anonymousKey: guest.anonymousKey };
  const accountB: SupportIdentity = { userId: "user-b", anonymousKey: guest.anonymousKey };
  const now = new Date("2026-10-23T12:00:00.000Z");
  const future = new Date("2026-10-24T00:00:00.000Z");
  const loggedConversation = { userId: "user-a", anonymousKey: guest.anonymousKey, expiresAt: future };
  const guestConversation = { userId: null, anonymousKey: guest.anonymousKey, expiresAt: future };
  const expired = { ...guestConversation, expiresAt: new Date("2026-10-22T00:00:00.000Z") };

  assert.deepEqual(supportConversationScope(accountA), { userId: "user-a" });
  assert.deepEqual(supportConversationScope(guest), { userId: null, anonymousKey: guest.anonymousKey });
  assert.equal(isSupportConversationAccessible(loggedConversation, accountA, now), true);
  assert.equal(isSupportConversationAccessible(loggedConversation, accountB, now), false);
  assert.equal(isSupportConversationAccessible(loggedConversation, guest, now), false, "logout must not expose an authenticated conversation through the cookie");
  assert.equal(isSupportConversationAccessible(guestConversation, guest, now), true);
  assert.equal(isSupportConversationAccessible(guestConversation, accountA, now), false, "login must not adopt a guest conversation");
  assert.equal(isSupportConversationAccessible(expired, guest, now), false);
});


test("empty compose budget and pricing use defaults; explicit zero budget remains zero", async t => {
  t.mock.method(redis, 'get', async () => JSON.stringify({ supportDailyBudgetCny: '12' }));
  const names = ['SUPPORT_DAILY_BUDGET_CNY', 'SUPPORT_USD_CNY_RATE', 'SUPPORT_LLM_INPUT_USD_PER_MILLION'];
  const saved = names.map(name => process.env[name]);
  try {
    for (const name of names) process.env[name] = '';
    const config = await getSupportConfig();
    assert.equal(config.dailyBudgetCny, 12); assert.equal(config.usdCnyRate, 7.2); assert.equal(config.inputUsdPerMillion, 0.1);
    process.env.SUPPORT_DAILY_BUDGET_CNY = '0';
    assert.equal((await getSupportConfig()).dailyBudgetCny, 12, 'saved admin budget takes precedence over environment default');
    t.mock.method(redis, 'get', async () => JSON.stringify({ supportDailyBudgetCny: '0' }));
    assert.equal((await getSupportConfig()).dailyBudgetCny, 0);
  } finally {
    names.forEach((name, index) => { if (saved[index] === undefined) delete process.env[name]; else process.env[name] = saved[index]; });
  }
});
