import test from "node:test";
import assert from "node:assert/strict";
import { Prisma } from "@prisma/client";
import { generateOrderNo } from "../src/lib/encryption";
import { createWithOrderNumber } from "../src/lib/order-number";
import { createOrderSchema } from "../src/lib/validations";
import { ORDER_PATTERN, PRODUCT_ORDER_PATTERN, orderKeywordSchema, orderPasswordSchema } from "../src/lib/order-rules";
import { withoutOrderPassword } from "../src/lib/order-public";

const valid = { productId: "product", quantity: 1, email: "Buyer@Example.com ", queryPassword: "  password-value  ", paymentMethod: "ALIPAY" };
test("single-product checkout requires a bounded password and normalizes only email", () => {
  const input = createOrderSchema.parse(valid);
  assert.equal(input.email, "buyer@example.com");
  assert.equal(input.queryPassword, valid.queryPassword);
  for (const queryPassword of [undefined, "", "1234567", " ".repeat(8), "x".repeat(73), "中".repeat(25)]) {
    assert.equal(createOrderSchema.safeParse({ ...valid, queryPassword }).success, false);
  }
  assert.equal(orderPasswordSchema.safeParse("中".repeat(24)).success, true);
  assert.equal(createOrderSchema.safeParse({ ...valid, items: [{ productId: "extra", quantity: 1 }] }).success, false);
  assert.equal(createOrderSchema.safeParse({ items: [{ productId: "product", quantity: 1 }], email: valid.email, paymentMethod: valid.paymentMethod }).success, false);
  assert.equal(createOrderSchema.safeParse({ ...valid, quantity: 1.1 }).success, false);
});
test("order numbers have fixed new formats and search accepts only product numbers or exact email", () => {
  const numbers = Array.from({ length: 1000 }, generateOrderNo);
  assert.equal(new Set(numbers).size, numbers.length);
  assert(numbers.every(number => PRODUCT_ORDER_PATTERN.test(number) && number.length === 22 && ORDER_PATTERN.test(`R${number}`)));
  assert.equal(orderKeywordSchema.parse(` ${numbers[0].toLowerCase()} `), numbers[0]);
  assert.equal(orderKeywordSchema.parse(" Buyer@Example.com "), "buyer@example.com");
  for (const keyword of ["261002180146238309", `R${numbers[0]}`, "@example.com", "buyer", "a%", ""]) assert.equal(orderKeywordSchema.safeParse(keyword).success, false);
});
test("only order-number collisions retry and the attempt limit is three", async () => {
  const collision = (target: string) => new Prisma.PrismaClientKnownRequestError("collision", { code: "P2002", clientVersion: "test", meta: { target: [target] } });
  const seen: string[] = [];
  const result = await createWithOrderNumber(async number => { seen.push(number); if (seen.length < 3) throw collision("orderNo"); return number; });
  assert.equal(result, seen[2]); assert.equal(new Set(seen).size, 3);
  let attempts = 0;
  await assert.rejects(createWithOrderNumber(async () => { attempts++; throw collision("orderNo"); }));
  assert.equal(attempts, 3);
  attempts = 0;
  await assert.rejects(createWithOrderNumber(async () => { attempts++; throw collision("transactionId"); }));
  assert.equal(attempts, 1);
});
test("admin order serialization never exposes the hash", () => {
  assert.deepEqual(withoutOrderPassword({ id: "order", queryPasswordHash: "hash" }), { id: "order", hasQueryPassword: true });
});
