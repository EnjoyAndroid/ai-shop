# 客服与微信群入口维护

使用 SUPER_ADMIN 账号进入后台「客服与社群」（`/admin/contact`），分别维护微信客服、Telegram 和微信交流群。原有配置继续使用，独立页面无需数据库迁移；系统设置页不再负责这些字段。保存后刷新商城即可看到更新，无需重新构建。

## 微信客服与 Telegram

- **微信客服**：上传客服本人的二维码或填写 HTTPS 图片地址，前台弹窗仅显示二维码与扫码提示，不展示微信号、联系说明或复制按钮。后台保留的文字字段仍由公开客服接口返回，不应填写私密备注。
- **隐藏微信入口**：同时清空客服文字和客服二维码。只填写文字时，入口仍显示，但弹窗会提示二维码未配置；因此要提供可用的微信联系方式，请配置二维码。
- **Telegram**：填写用户名或官方链接，清空后隐藏入口。帮助页同时展示已配置的联系方式，订单/支付页的「联系客服」优先打开微信弹窗，没有微信配置时跳转 Telegram。
- **邮件**：前台已移除发送邮件入口；SMTP 仍用于密码重置和付款通知，配置见项目 README。

微信客服二维码用于联系个人客服，微信群二维码用于加入群聊，两处应分别配置。客服二维码没有群邀请的过期时间设置；上传或粘贴图片后，应在帮助页打开弹窗确认图片可用。图片加载失败时，关闭并重新打开弹窗可重试。

首页和项目 README 的二维码指向站点的 `/community` 页面，页面显示后台配置的最新微信群二维码。更换微信群二维码时，固定入口和 README 图片无需更换。

## 更新群二维码

1. 在微信中获取当前有效的群二维码。
2. 在后台「客服与社群 → 微信交流群」上传图片，或粘贴 HTTPS 图片地址。
3. 按微信显示的有效期填写过期时间，点击「保存设置」。时间输入使用当前设备时区，公开页面显示北京时间。
4. 打开固定入群页面，确认二维码能识别；入群仍受微信的群人数和邀请规则限制。

上传图片复用现有 Cloudinary 配置，重新编码、移除图片元数据并使用无损压缩。更换图片后，打开页面即可看到新码；已经打开的页面每分钟检查更新，也可手动刷新。未配置图片时提示交流群暂未开放；未设置有效期时展示图片直到管理员更换或移除。

设置过期时间后，服务端停止返回过期图片，已打开页面也会在到期后隐藏它。页面分别处理未配置、已过期、网络失败和图片加载失败。固定入口不会延长微信邀请的有效期，应用不自动创建或刷新微信群二维码。

## 自托管或更换站点域名

1. 正确配置 `NEXT_PUBLIC_SITE_URL`，修改该构建变量后重新构建并部署应用。
2. 把中英文 README 的入群页面链接改为自己的站点地址。
3. 生成 README 中的固定入口图片：

   ```bash
   npm run community:qr -- https://example.com
   ```

   未传入参数时，命令使用 `.env` 中的 `NEXT_PUBLIC_SITE_URL`。

4. 将 `docs/community/wechat-entry.png` 与 README 一并提交。后台也提供首页固定入口二维码的下载。

README 使用仓库内的固定入口图片，避免依赖 GitHub 图片代理及时刷新群码。真实微信群二维码仅在后台配置，不需要写进 Git 历史。

## English

Use a SUPER_ADMIN account to open Support & community at `/admin/contact`. Existing configuration is preserved; moving these settings out of System settings does not require a database migration. Save and refresh the storefront to apply changes.

The WeChat support dialog displays only a QR image and scanning instructions. The retained support text is not shown in the dialog, but remains available through the public contact API; do not use it for private notes. Clear both support text and QR URL to hide the entry. A text-only configuration still shows the entry but opens a “QR code not configured” message. Support QR codes and group invitation codes are separate settings, and support QR codes have no group-expiry field.

Telegram accepts a username or official link and is hidden when blank. The help page shows configured contact methods; order/payment support prefers WeChat when configured and otherwise links to Telegram. Storefront email links have been removed; SMTP continues to serve password resets and payment notifications.

The homepage and README QR codes open `/community`, which displays the latest group invitation configured by a super administrator. Replace the group QR image and optionally set its expiry under Support & community → WeChat community, then save. Existing pages check for updates every minute and offer a manual refresh button.

Expired images are hidden, but WeChat invitations are not automatically renewed. Joining remains subject to WeChat group and invitation limits. Uploaded QR images use lossless compression through the existing Cloudinary integration.

For a self-hosted instance or domain change, set `NEXT_PUBLIC_SITE_URL`, rebuild, update both README links, and run `npm run community:qr -- https://example.com`. Commit the generated entry image and README changes together. Group invitation images do not need to be committed to Git.
