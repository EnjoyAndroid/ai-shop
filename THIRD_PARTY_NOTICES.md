# 第三方资源与许可证

AI Shop 自有代码按根目录 LICENSE 中的 MIT 许可证提供。第三方代码、字体和数据继续适用各自许可证。

- Inter 字体：Copyright (c) 2016 The Inter Project Authors，SIL Open Font License 1.1，完整文本见 `public/fonts/OFL.txt`；本项目使用未修改的拉丁字形字体文件。
- Next.js、React、Cloudinary SDK 等采用 MIT；Auth.js、Lucide 等采用 ISC；Prisma 采用 Apache-2.0。分发依赖或容器时保留各包自带的 LICENSE、NOTICE 等文件。
- sharp/libvips 使用 Apache-2.0/LGPL 等各自组件许可。保留 npm 平台包附带的许可证和第三方通知，详见对应包和 https://sharp.pixelplumbing.com/install/ 。
- 构建/开发依赖中包含 axe-core（MPL-2.0）、caniuse-lite 数据（CC-BY-4.0）等。修改或再分发这些组件时须遵守对应源代码或署名条款；本项目 MIT 授权不取代这些条款。
- braces 3.0.3（MIT）：安装时由 `scripts/patch-braces.mjs` 添加解析栈深度限制，缓解 GHSA-vfj7-8cjw-p6xm。保留包内原始 LICENSE 和版本号；补丁及移除条件见 `docs/security.md`。
- 项目保留原有支付宝、微信支付方式图标。各服务名称及商标属于相应权利人，名称用于说明集成对象，不表示官方授权或合作关系。

完整依赖版本以 `package-lock.json` 为准；发布容器或二进制之前，应针对实际分发的依赖生成许可证清单并保留原始通知。本文件不声明第三方商品转售授权。
