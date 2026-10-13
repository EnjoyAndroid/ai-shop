import test from "node:test";
import assert from "node:assert/strict";
import { contactSettingsSchema, EMPTY_CONTACT_SETTINGS, getPublicContactSettings } from "../src/lib/contact-settings";

test("contact settings validate QR URLs and lengths; public response exposes only display fields", () => {
  const settings = { ...EMPTY_CONTACT_SETTINGS, telegramUrl: '@test_support', wechatSupportText: '  demo_support\n服务时间：09:00–18:00  ', wechatSupportQrUrl: 'https://example.com/support.png' };
  const parsed = contactSettingsSchema.parse(settings);
  assert.equal(parsed.telegramUrl, 'https://t.me/test_support');
  assert.equal(parsed.wechatSupportText, 'demo_support\n服务时间：09:00–18:00');
  assert.deepEqual(getPublicContactSettings({ ...parsed, wechatGroupQrUrl: 'https://example.com/group.png', privateSetting: 'not-for-public-view' }), { telegramUrl: parsed.telegramUrl, wechatSupportText: parsed.wechatSupportText, wechatSupportQrUrl: settings.wechatSupportQrUrl });
  for (const value of ['javascript:alert(1)', 'http://example.com/qr.png', 'https://user:password@example.com/qr.png', 'data:image/png,test']) {
    assert.equal(contactSettingsSchema.safeParse({ ...settings, wechatSupportQrUrl: value }).success, false);
    assert.equal(getPublicContactSettings({ wechatSupportQrUrl: value }).wechatSupportQrUrl, '');
  }
  assert.equal(contactSettingsSchema.safeParse({ ...settings, wechatSupportText: 'x'.repeat(301) }).success, false);
  assert.equal(contactSettingsSchema.partial().safeParse({ siteName: 'not-a-contact-field' }).success, false);
});

test("WeChat text and QR can be configured independently and cleared", () => {
  assert.equal(contactSettingsSchema.parse({ ...EMPTY_CONTACT_SETTINGS, wechatSupportText: 'demo_support' }).wechatSupportQrUrl, '');
  assert.equal(contactSettingsSchema.parse({ ...EMPTY_CONTACT_SETTINGS, wechatSupportQrUrl: 'https://example.com/qr.png' }).wechatSupportText, '');
  assert.deepEqual(getPublicContactSettings(EMPTY_CONTACT_SETTINGS), { telegramUrl: '', wechatSupportText: '', wechatSupportQrUrl: '' });
});
