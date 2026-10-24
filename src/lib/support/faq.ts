/** Exact, complete questions only: never authorize arbitrary text by substring. */
export const SUPPORT_QUICK_QUESTIONS = [
  "怎么买商品？", "支持哪些支付方式？", "哪些商品有库存？",
  "支付成功后怎么查看卡密？", "怎么查询我的订单？", "如何联系客服？",
];
const aliases = [
  ["如何购买商品", "购买流程", "怎么下单"],
  ["付款方式", "怎么付款", "支持什么支付方式"],
  ["查看商品库存", "查询商品库存", "哪些商品有货"],
  ["支付后如何领取卡密", "付款后没看到卡密", "怎么拿激活码"],
  ["如何查询订单", "怎么查订单", "查看订单"],
  ["人工客服", "客服联系方式", "微信客服二维码"],
];
const normalize = (value: string) => value.normalize("NFKC").trim().replace(/[？?！!。]+$/u, "").trim();
export function trustedSupportFaq(question: string): string | null {
  const value = normalize(question);
  const index = SUPPORT_QUICK_QUESTIONS.findIndex((canonical, i) =>
    normalize(canonical) === value || aliases[i].some(alias => normalize(alias) === value));
  return index < 0 ? null : SUPPORT_QUICK_QUESTIONS[index];
}
