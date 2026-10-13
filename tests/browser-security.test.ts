import test from "node:test";
import assert from "node:assert/strict";
import { browserWriteAllowed, contentSecurityPolicy } from "../src/lib/browser-security";

const canonical = "https://shop.example.com";
const request = (origin?: string, method = "POST", extra: Record<string, string> = {}) => ({ method, headers: new Headers({ ...(origin === undefined ? {} : { origin }), ...extra }) });

test("browser writes require exact configured origin, including same-site siblings", () => {
  for (const path of ["/api/admin/settings", "/api/admin/auth/login", "/api/admin/auth/logout", "/api/orders", "/api/recharge", "/api/auth/callback/credentials", "/api/upload"]) {
    assert(browserWriteAllowed(request(canonical), path, canonical));
    assert(browserWriteAllowed(request(canonical, "POST", { "sec-fetch-site": "same-origin" }), path, canonical));
    for (const origin of [undefined, "", "null", "https://other.example.com", "http://shop.example.com", "https://shop.example.com:8443", canonical + ".invalid", canonical + "/"]) {
      assert(!browserWriteAllowed(request(origin), path, canonical));
    }
    assert(!browserWriteAllowed(request("https://evil.example.invalid", "POST", { host: "evil.example.invalid", "x-forwarded-host": "evil.example.invalid" }), path, canonical));
    assert(!browserWriteAllowed(request(canonical, "POST", { "sec-fetch-site": "same-site" }), path, canonical));
  }
  for (const value of [undefined, "garbage", "file:///tmp", "https://user:password@example.com"]) assert(!browserWriteAllowed(request(canonical), "/api/orders", value));
});

test("only exact signed callback endpoints bypass browser origin validation", () => {
  for (const path of ["/api/payment/callback/alipay", "/api/payment/callback/wechat"]) assert(browserWriteAllowed(request(), path, canonical));
  for (const path of ["/api/payment/callback/alipay/extra", "/api/payment/callback/unknown", "/api/payment/usdt/check"]) assert(!browserWriteAllowed(request(), path, canonical));
  assert(browserWriteAllowed(request(undefined, "GET"), "/api/orders/anything", canonical));
  assert(browserWriteAllowed(request(undefined, "GET"), "/api/cron/cancel-expired-orders", canonical));
});

test("production CSP requires nonces and forbids inline event handlers, embedding and external connections", () => {
  const policy = contentSecurityPolicy("syntheticNonce", false);
  const script = policy.split("; ").find(value => value.startsWith("script-src "))!;
  assert(script.includes("'nonce-syntheticNonce'"));
  assert(!script.includes("'unsafe-inline'")); assert(!script.includes("'unsafe-eval'"));
  for (const directive of ["script-src-attr 'none'", "object-src 'none'", "base-uri 'none'", "frame-ancestors 'none'", "form-action 'self'", "connect-src 'self'"]) assert(policy.includes(directive));
  assert(contentSecurityPolicy("devNonce", true).includes("'unsafe-eval'"));
});
