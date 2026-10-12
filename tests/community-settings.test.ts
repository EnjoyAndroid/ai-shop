import test from "node:test";
import assert from "node:assert/strict";
import { getCommunitySettings, getCommunityEntryUrl, wechatGroupQrUrlSchema, wechatGroupExpiresAtSchema } from "../src/lib/community-settings";

test("community settings expose only a valid current invitation, and expire at the exact deadline", () => {
  const now = Date.parse("2026-10-12T00:00:00Z");
  const settings = { wechatGroupQrUrl: "https://example.com/group.png", wechatGroupExpiresAt: "2026-10-12T08:00:00+08:00", privateSetting: "not-for-public-view" };
  assert.deepEqual(getCommunitySettings(settings, now - 1), { status: "active", qrCodeUrl: settings.wechatGroupQrUrl, expiresAt: settings.wechatGroupExpiresAt });
  assert.deepEqual(getCommunitySettings(settings, now), { status: "expired", qrCodeUrl: "", expiresAt: settings.wechatGroupExpiresAt });
  assert.equal(getCommunitySettings({ ...settings, wechatGroupExpiresAt: "" }, now).status, "active");
  assert.equal(getCommunitySettings({}, now).status, "unconfigured");
  assert.equal(getCommunitySettings({ ...settings, wechatGroupExpiresAt: "invalid" }, now).qrCodeUrl, "");
});

test("community configuration rejects unsafe image URLs and invalid dates", () => {
  for (const url of ["javascript:alert(1)", "data:image/svg+xml,test", "http://example.com/qr.png", "https://user:password@example.com/qr.png", "/qr.png"]) {
    assert.equal(wechatGroupQrUrlSchema.safeParse(url).success, false);
    assert.equal(getCommunitySettings({ wechatGroupQrUrl: url }).qrCodeUrl, "");
  }
  assert.equal(wechatGroupExpiresAtSchema.safeParse("2026-02-30T00:00:00Z").success, false);
  assert.equal(wechatGroupExpiresAtSchema.safeParse("tomorrow").success, false);
  assert.equal(wechatGroupExpiresAtSchema.safeParse(0).success, false);
});

test("permanent community entry uses the configured origin and never carries credentials or query parameters", () => {
  assert.equal(getCommunityEntryUrl("https://example.com/store?ticket=private#fragment"), "https://example.com/community");
  assert.equal(getCommunityEntryUrl("http://localhost:3010"), "http://localhost:3010/community");
  assert.throws(() => getCommunityEntryUrl("javascript:alert(1)"));
  assert.throws(() => getCommunityEntryUrl("https://user:password@example.com"));
});
