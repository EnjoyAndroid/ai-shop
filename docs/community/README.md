# 微信交流群入口维护

首页和项目 README 的二维码指向站点的 `/community` 页面，页面显示后台配置的最新微信群二维码。更换微信群二维码时，固定入口和 README 图片无需更换。

## 更新群二维码

1. 在微信中获取当前有效的群二维码。
2. 在后台「系统设置 → 微信交流群」上传图片，或粘贴 HTTPS 图片地址。
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

The homepage and README QR codes open `/community`, which displays the latest group invitation configured by a super administrator. Replace the group QR image and optionally set its expiry under System settings → WeChat community, then save. Existing pages check for updates every minute and offer a manual refresh button.

Expired images are hidden, but WeChat invitations are not automatically renewed. Joining remains subject to WeChat group and invitation limits. Uploaded QR images use lossless compression through the existing Cloudinary integration.

For a self-hosted instance or domain change, set `NEXT_PUBLIC_SITE_URL`, rebuild, update both README links, and run `npm run community:qr -- https://example.com`. Commit the generated entry image and README changes together. Group invitation images do not need to be committed to Git.
