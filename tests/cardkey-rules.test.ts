import test from "node:test";
import assert from "node:assert/strict";
import { editCardKeySchema } from "../src/lib/services/cardkey.service";

test("card edits require a single nonempty key and version; cannot change product or allocation", () => {
  const input = { content: "  SYNTHETIC-KEY  ", batchNo: " test-batch ", updatedAt: "2026-10-12T00:00:00Z" };
  const result = editCardKeySchema.parse(input);
  assert.equal(result.content, "SYNTHETIC-KEY");
  assert.equal(result.batchNo, "test-batch");
  for (const update of [{ content: "   " }, { content: "key1\nkey2" }, { updatedAt: "invalid" }, { updatedAt: undefined }, { status: "AVAILABLE" }, { productId: "other-product" }, { orderId: null }, { content: "x".repeat(10001) }]) {
    assert.equal(editCardKeySchema.safeParse({ ...input, ...update }).success, false);
  }
});
