import test from "node:test";
import assert from "node:assert/strict";
import { adminDestination, adminLoginUrl } from "../src/lib/admin-navigation";

test("admin login preserves the configured origin and intended internal page", () => {
  const url = adminLoginUrl("/admin/support", "http://127.0.0.1:3013", "http://localhost:3013/admin/support");
  assert.equal(url.origin, "http://127.0.0.1:3013");
  assert.equal(url.pathname, "/admin/login");
  assert.equal(url.searchParams.get("next"), "/admin/support");
  assert.equal(adminDestination("/admin/orders/order-123"), "/admin/orders/order-123");
});
test("admin return destinations reject external URLs, encodings and login loops", () => {
  for (const value of [undefined, ["/admin/support"], "https://evil.invalid", "//evil.invalid", "/\\evil.invalid", "/admin/../other", "/admin/%2F%2Fevil", "/admin/support?next=evil", "/admin/support#x", "/admin/login", "/admin/login/nested", "/other"]) {
    assert.equal(adminDestination(value), "/admin/dashboard", String(value));
  }
  assert.throws(() => adminLoginUrl("/admin/support", "https://user:secret@example.com", "http://localhost"));
});
