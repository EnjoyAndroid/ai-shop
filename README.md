# AI Shop

**简体中文** | [English](README.en.md)

官网：[https://5aishop.com](https://5aishop.com)

一个可自托管的数字商品商城，提供商品展示、自助购买、自动发货、安全订单查询和完整运营后台。基于 Next.js、TypeScript、PostgreSQL、Prisma 和 Redis，支持桌面与手机访问。

## 微信交流群

交流项目部署、使用经验和功能建议。扫描下方二维码或点击 [入群页面](https://5aishop.com/community)，在微信中识别页面内的最新群二维码。

<a href="https://5aishop.com/community"><img src="docs/community/wechat-entry.png" width="160" height="160" alt="AI Shop 微信交流群固定入口二维码" /></a>

## 项目预览

![AI Shop 商城首页](docs/screenshots/01-storefront.png)

从买家下单到后台运营，覆盖商品、会员、余额、订单、卡密和系统设置。以下素材来自独立演示环境，所有账号、订单、金额和卡密均为演示数据。

截图和视频采集于 2026-10-04，尚未包含后续的独立「客服与社群」页面、未售出卡密管理和后台固定侧栏。当前功能与配置入口以下文说明为准。

[下载 86 秒功能导览（1080p MP4）](docs/showcase/ai-shop-feature-tour.mp4) · [查看 19 张功能截图](docs/showcase/README.md)

https://github.com/user-attachments/assets/5f4e285b-39c4-4d1d-bfe6-f762d8f530ca

导览视频由真实页面截图、字幕与转场合成，非连续操作录屏。演示流程实际完成了一笔余额付款与自动发货；第三方收款、邮件及 Telegram 通知未在采集时调用。

<details>
<summary>买家功能：下单、查询、自动发货、会员与余额</summary>

### 商品详情与直接下单

![商品详情与下单](docs/screenshots/02-product.png)

### 订单查询与安全验证

![订单查询](docs/screenshots/05-order-search.png)

![拼图安全验证](docs/screenshots/06-slider-verification.png)

![订单列表](docs/screenshots/07-order-list.png)

### 自动发货与卡密查看

![发货结果](docs/screenshots/04-delivery.png)

### 会员中心与余额流水

![会员中心](docs/screenshots/08-member-center.png)

![余额明细](docs/screenshots/09-balance.png)

</details>

<details>
<summary>管理功能：运营统计、商品、订单、卡密和系统设置</summary>

### 运营仪表盘

![运营仪表盘](docs/screenshots/10-admin-dashboard.png)

### 商品与卡密库存

![商品管理](docs/screenshots/11-admin-products.png)

![卡密导入](docs/screenshots/12-admin-cardkeys.png)

### 订单管理与系统设置

![订单管理](docs/screenshots/13-admin-orders.png)

![系统设置](docs/screenshots/14-admin-settings.png)

</details>

## 主要功能

### 买家体验

- **直接购买**：在商品页选择数量，填写邮箱并设置订单查询密码，无需加入购物车，也支持游客下单。
- **付款后自动发货**：在订单详情查看卡密，支持复制和下载；会员可使用站内余额并享受等级折扣。
- **邮箱与订单号查询**：完成拼图验证后进入独立订单列表，支持状态筛选、分页，查看详情时验证该订单密码。
- **最近邮箱缓存**：查询成功后在当前浏览器保存最近 3 个邮箱，可点击填入或删除，订单号不缓存。
- **会员中心**：查看账户、最近订单和余额流水；个人中心、订单、余额之间切换时保留公共导航。
- **智能客服**：通过全站智能客服入口获取购买、商品、库存、支付、订单和售后帮助；需要人工处理时可转微信或 Telegram。
- **手机端适配**：响应式商品页面、订单卡片、移动导航与触屏拼图验证。

购买流程：**选择商品 → 填写邮箱与查询密码 → 完成付款 → 自动发货 → 查看订单详情**。

### 管理与运营

- **运营仪表盘**：查看订单、收入、用户、待处理订单和库存预警。
- **商品与分类**：编辑商品、封面、价格、购买数量限制、排序和上下架状态。
- **卡密库存**：按商品批量导入卡密，支持批次标记；未售出卡密可按状态分页查看，逐条解密、编辑或删除，订单占用与已售出卡密禁止修改。加密存储并在下单时预留库存。
- **订单与用户**：查看订单详情与会员等级，处理发货、取消、退款、用户状态和余额调整；会员等级按累计消费自动升级。
- **公告与系统设置**：配置公告、站点信息、订单有效期和支付开关；独立「客服与社群」页面管理微信客服、Telegram 及微信群。
- **微信群固定入口**：首页与 README 共用入群页面；后台更换群二维码和设置有效期，过期后停止展示旧群码。
- **后台角色分工**：OPERATOR 负责商品及发货，ADMIN 管理用户和财务，SUPER_ADMIN 管理系统设置及客服与社群配置。
- **后台菜单切换**：管理页面共用固定侧栏，切换时只加载右侧内容，支持加载骨架、切换提示与失败重试。
- **智能客服后台**：维护客服知识草稿与发布，查看模型状态及 token/费用；「配置」集中管理每日预算、问答/身份/IP及用量保留期、游客/会员日额度与分钟限额。
- **客服响应速度**：六个固定常见问题及完整同义问法直接读取已发布知识与实时业务数据，无需等待模型；库存常见问题仅展示已上架且库存大于 0 的商品；自由提问采用一次规划加一次回答，仍受只读工具和可配置提问额度及固定安全边界约束。

### 支付与通知

支持支付宝、微信（虎皮椒）、USDT TRC20 和会员余额。第三方支付需配置真实凭据并启用通道；ERC20 自动收款未开放。

邮箱用于订单查询和可选通知。邮件与 Telegram 通知需另行配置，未配置时仍可在订单详情领取卡密。余额退款自动返还站内余额，外部支付退款需在支付平台人工完成后于后台登记。

### 订单与数据保护

订单使用安全随机编号，查询密码以哈希保存、卡密以 AES-256-GCM 加密。公开查询先展示摘要，再验证密码领取发货内容；登录会员只可查看本人订单，充值订单仅本人登录可查。资金、库存和发货由数据库事务保障，重复回调不重复入账。

订单隐私、账号权限与部署要求见 [安全与使用边界](docs/security.md)。

## 环境

- Node.js 22.14+（推荐 Node.js 22 LTS）
- PostgreSQL 15+、Redis 7+，二者均为必需服务
- Docker Compose 2.24.4+（本机覆盖文件使用 `!override`）

## 配置文件

只需要区分两个入口：**本地开发改 `.env`，线上配置改 `.deploy/production.env`**。
测试凭据由 `npm run env:init` 自动生成，无需手动配置。`.env.example` 是说明模板，不会生效。
当前商城模型 key 在 `.deploy/production.env`；修改后仍需明确部署才会影响线上。
运行 `npm run env:status` 查看配置位置和状态，不显示密钥。详见 [配置说明](CONFIGURATION.md)。

## 隔离开发与部署

默认命令只操作开发环境，开发和验收不再共用生产配置、数据库或 Redis。默认 Compose 项目是 `ai-shop-dev`，生产继续使用独立的 `ai-shop` 项目，私有配置保存在被忽略的 `.deploy/` 中。

```bash
npm ci
npm run env:init
npm run dev:up
npm run db:generate
npm run db:prepare
npm run db:seed
npm run dev
```

- 本地开发与人工验收：http://127.0.0.1:3013；数据库 55440、Redis 16380，仅绑定本机。
- 验收：独立 `ai-shop-test` 服务（55441 / 16381），HTTP 测试使用 3011，临时镜像检查使用 3014（完成即停止）。
- 生产：原公网域名，通过本机 3010 入口访问；开发和验收不重建或重启生产。
- 开发管理员 `admin` 密码由 `.env` 随机生成。开发/验收不复制生产数据和密钥，默认关闭真实支付、邮件、通知及付费模型。

```bash
npm run test:up
npm run release:prepare
```

该命令执行验收、构建固定镜像并检查隔离预览。任何门禁失败都会阻止发布，**不会自动部署公网**。确认版本与验收结果、明确授权部署后执行：

```bash
npm run release:deploy -- <release-id> --confirm-production
```

发布会先备份数据库，显式运行迁移，仅更新应用镜像并重载 Nginx，不执行演示 seed、不重建 PostgreSQL/Redis。新镜像启动不再自动迁移。配置、首次接管与回退见[环境隔离与部署指南](docs/operations/environments.md)。当前生产配置保存在 `.deploy/production.env`，不要复制回 `.env`。

| 功能 | 配置方式 |
|---|---|
| 支付宝 | `XUNHU_ALIPAY_APPID`、`XUNHU_ALIPAY_APPSECRET` |
| 微信 | `XUNHU_WECHAT_APPID`、`XUNHU_WECHAT_APPSECRET` |
| USDT TRC20 | `USDT_TRC20_ADDRESS`、可选 `TRONGRID_API_KEY` |
| 系统邮件（密码重置、付款通知） | `SMTP_HOST`、`SMTP_PORT`、`SMTP_USER`、`SMTP_PASS`、`MAIL_FROM` |
| Telegram 通知 | `TELEGRAM_BOT_TOKEN`、`TELEGRAM_CHAT_ID` |
| 图片上传 | `CLOUDINARY_CLOUD_NAME`、`CLOUDINARY_API_KEY`、`CLOUDINARY_API_SECRET` |
| 微信客服 | 后台「客服与社群 → 微信客服」上传客服二维码；前台弹窗仅展示二维码与扫码提示 |
| Telegram 客服 | 后台「客服与社群 → Telegram 客服」，留空隐藏入口 |
| 微信交流群 | 后台「客服与社群 → 微信交流群」，上传最新群二维码并设置可选过期时间 |
| 智能客服模型 | `SUPPORT_LLM_BASE_URL`、商城专用 `SUPPORT_LLM_API_KEY`、`SUPPORT_LLM_MODEL`；详细配置见 [智能客服技术文档](docs/ai-support.md) |
| 外部定时调用 | `CRON_SECRET`，请求携带 `Authorization: Bearer ...` |
| 待付库存额度 | `MAX_PENDING_ORDERS=3`、`MAX_PENDING_QUANTITY=100`，分别限制每个账号、邮箱和可信客户端 IP |

本地日常开发和人工验收共用 `.env`、数据库与账号，始终访问 3013。运行 `npm run dev` 调试，准备验收时先退出开发进程再运行 `npm run release:prepare`；门禁通过后自动切换固定镜像，数据不会重置。自动化测试仍与本地数据隔离。3013 真实模型联调可在 `.env` 填写专用 `SUPPORT_LLM_API_KEY`、网关地址与限额；自动化测试继续禁止外部模型凭据。

## 验证与维护

更新已部署的实例前，备份数据库和 `.deploy/production.env`，保留原卡密加密密钥。

CI 覆盖生产构建、隔离测试、HTTP 验收及安全扫描。贡献前的完整验证命令见 [贡献说明](CONTRIBUTING.md)；已知依赖告警及临时补丁见 [依赖维护说明](docs/security.md#验证与依赖维护)。

- [开发日志：优化、问题根因、验证及发布结果](dev_log.md)
- [开发记录规范与模板](CONTRIBUTING.md#开发日志与交付记录)
- [客服与社群维护](docs/community/README.md)
- [安全策略与私密漏洞报告](SECURITY.md)
- [贡献说明](CONTRIBUTING.md)
- [第三方许可证说明](THIRD_PARTY_NOTICES.md)
- [MIT 许可证](LICENSE)

## 许可证

项目代码使用 MIT 许可证。商品、品牌名称只用于演示和描述兼容服务，不表示第三方账号转售授权。实际运营前请自行完成收款联调、数据保护与商品授权核对。
