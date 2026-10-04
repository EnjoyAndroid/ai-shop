# AI Shop

一个可自托管的数字商品商城，提供商品展示、自助购买、自动发货、安全订单查询和完整运营后台。基于 Next.js、TypeScript、PostgreSQL、Prisma 和 Redis，支持桌面与手机访问。

## 项目预览

![AI Shop 商城首页](docs/screenshots/01-storefront.png)

从买家下单到后台运营，覆盖商品、会员、余额、订单、卡密和系统设置。以下素材来自独立演示环境，所有账号、订单、金额和卡密均为演示数据。

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
- **手机端适配**：响应式商品页面、订单卡片、移动导航与触屏拼图验证。

购买流程：**选择商品 → 填写邮箱与查询密码 → 完成付款 → 自动发货 → 查看订单详情**。

### 管理与运营

- **运营仪表盘**：查看订单、收入、用户、待处理订单和库存预警。
- **商品与分类**：编辑商品、封面、价格、购买数量限制、排序和上下架状态。
- **卡密库存**：按商品批量导入卡密，支持批次标记，加密存储并在下单时预留库存。
- **订单与用户**：查看订单详情，处理发货、取消与退款，管理会员等级、用户状态和余额。
- **公告与系统设置**：配置公告、站点信息、订单有效期、支付开关及 Telegram 客服。
- **后台角色分工**：OPERATOR 负责商品及发货，ADMIN 管理用户和财务，SUPER_ADMIN 管理系统设置。

### 支付与通知

支持支付宝、微信（虎皮椒）、USDT TRC20 和会员余额。第三方支付需配置真实凭据并启用通道；ERC20 自动收款未开放。

邮箱用于订单查询和可选通知。邮件与 Telegram 通知需另行配置，未配置时仍可在订单详情领取卡密。余额退款自动返还站内余额，外部支付退款需在支付平台人工完成后于后台登记。

### 订单与数据保护

订单使用安全随机编号，查询密码以哈希保存、卡密以 AES-256-GCM 加密。公开查询先展示摘要，再验证密码领取发货内容；登录会员只可查看本人订单，充值订单仅本人登录可查。资金、库存和发货由数据库事务保障，重复回调不重复入账。

密码策略、查询凭证与限流规则见 [安全策略](SECURITY.md)。

## 环境

- Node.js 22.14+（推荐 Node.js 22 LTS）
- PostgreSQL 15+、Redis 7+，二者均为必需服务
- Docker Compose 2.24.4+（本机覆盖文件使用 `!override`）

## 本机部署

```bash
npm ci
cp .env.example .env
```

填写 `.env`：数据库密码、`NEXTAUTH_SECRET`、`ENCRYPTION_KEY` 和 `CRON_SECRET` 应分别随机生成；`ADMIN_PASSWORD` 首次初始化必须为 12–72 位。生成单个随机值：

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

`DATABASE_URL` 中密码与 `DB_PASSWORD` 一致。模板使用 `localhost:55439` 数据库、`localhost:16379/1` Redis 和 `http://localhost:3010` 网站地址。实际 `.env` 不提交到 Git。

```bash
# 启动依赖服务
docker compose -f docker-compose.yml -f docker-compose.local.yml up -d postgres redis

# 生成客户端、建立/升级结构、初始化演示数据和管理员
npm run db:generate
npm run db:prepare
npm run db:seed

# 验证并部署
npm run build
docker compose -f docker-compose.yml -f docker-compose.local.yml up -d --build
```

访问：

- 商城：http://localhost:3010
- 后台：http://localhost:3010/admin/login
- 管理员：`admin`，密码为首次初始化时的 `ADMIN_PASSWORD`，不存在内置默认密码。重复初始化不会重置已有密码。

当前机器如已有 `.env.local` 指向 `.env` 的链接，可以继续使用。Node CLI 的种子脚本读取 `.env`；Next.js 本身也读取 `.env.local`，避免在两处维护冲突配置。

```bash
# 状态、日志、停止（保留数据卷）
docker compose -f docker-compose.yml -f docker-compose.local.yml ps
docker compose -f docker-compose.yml -f docker-compose.local.yml logs -f app
docker compose -f docker-compose.yml -f docker-compose.local.yml down
```

## 服务器部署

1. 复制 `.env.production.example` 为 `.env`，填写独立随机密钥、数据库密码和真实 HTTPS 域名。
2. 安装 Docker/Compose，配置域名与 TLS 入口。仓库 Nginx 默认提供 HTTP 80，适用于置于已经配置 TLS 的可信反向代理后；不要把这个默认入口当成已完成公网 HTTPS 部署。
3. 使用 Cloudflare 时配置源站证书和 **Full (strict)**，限制源站来源；不使用 Flexible。若需真实访客 IP，按 Cloudflare 官方 IP 范围配置 Nginx `set_real_ip_from` / `real_ip_header`，只信任受限来源。
4. 执行 `docker compose up -d --build`。应用容器会先运行数据库迁移，再启动网站；数据库、Redis 和应用端口仅在内部网络可用。
5. 首次管理员与演示数据初始化：

```bash
# 将 .env 中的 ADMIN_PASSWORD 安全地传给初始化进程，不写入命令行明文。
# app 容器运行环境中不持久保存管理员初始密码。
set -a
. ./.env
set +a
docker compose exec -e ADMIN_PASSWORD app node seed.cjs
unset ADMIN_PASSWORD
```

使用纯赋值格式的可信 `.env`；不要从不可信来源执行该文件。也可以通过宿主机 Node 环境运行 `npm run db:seed`，但 DATABASE_URL 必须可从宿主机访问。

系统默认仅启用余额支付。启用第三方收款需要同时配置服务端凭据和后台开关；凭据缺失时创建支付和回调会被拒绝。

| 功能 | 环境变量 |
|---|---|
| 支付宝 | `XUNHU_ALIPAY_APPID`、`XUNHU_ALIPAY_APPSECRET` |
| 微信 | `XUNHU_WECHAT_APPID`、`XUNHU_WECHAT_APPSECRET` |
| USDT TRC20 | `USDT_TRC20_ADDRESS`、可选 `TRONGRID_API_KEY` |
| 邮件 | `SMTP_HOST`、`SMTP_PORT`、`SMTP_USER`、`SMTP_PASS`、`MAIL_FROM` |
| Telegram 通知 | `TELEGRAM_BOT_TOKEN`、`TELEGRAM_CHAT_ID` |
| 图片上传 | `CLOUDINARY_CLOUD_NAME`、`CLOUDINARY_API_KEY`、`CLOUDINARY_API_SECRET` |
| 客服邮箱展示 | `NEXT_PUBLIC_CONTACT_EMAIL` |
| Telegram 客服 | 后台「系统设置 → 客服设置」，留空隐藏入口 |
| 外部定时调用 | `CRON_SECRET`，请求携带 `Authorization: Bearer ...` |

`NEXT_PUBLIC_*` 在构建时写入前端，修改后重新构建镜像。Telegram 客服通过后台设置，支持 `@用户名` 或 `https://t.me/用户名`，保存后刷新商城生效；不再读取旧的 `NEXT_PUBLIC_TELEGRAM_URL`。未配置时隐藏 Telegram 入口。客服邮箱环境变量默认空。图片默认允许 Cloudinary 域名；使用其他存储需在 `next.config.mjs` 中明确添加域名。

## 升级、备份与迁移

**订单结构变更**：`20261003000000_order_query` 迁移仅支持空订单表，移除旧明文查询密码字段，不提供历史订单转换。已有正式订单的部署不能直接应用此迁移，也不能为通过迁移而删除正式订单。仅演示/测试部署可在核实并备份后定向清理测试订单及关联数据；启动脚本不会自动清理订单。


升级前备份数据库及 `.env`，备份目录不可公开：

```bash
mkdir -p backups
chmod 700 backups
docker compose exec -T postgres pg_dump -U aishop -d ai_shop > backups/ai-shop.sql
chmod 600 backups/ai-shop.sql
```

`npm run db:prepare` 支持新数据库和原来使用 `db push` 建立的数据库：旧库必须与已保存的旧版 schema 一致，才会标记基线并应用新迁移。存在结构差异时停止，由维护者核对。禁止为绕过迁移失败执行 reset 或删除数据卷。

资金完整性迁移为历史已支付订单建立唯一流水记录；发现重复流水或负余额时会失败并回滚，需人工核账后再迁移。历史 USDT 待支付订单没有固定报价时，不自动猜测应付金额。

迁移新增会话版本字段，升级后用户和管理员需重新登录。不要仅回滚镜像而忽略 schema 和历史数据版本。加密密钥继续保持原值，轮换必须先完成旧卡密重新加密。

本版本保留财务记录、支付流水防重记录和已售卡密，不自动删除这些审计数据。过期订单每分钟检查并释放库存；取消/无关联记录的历史订单可由清理逻辑处理。默认订单有效期 10 分钟、清理阈值 90 天。

## 验证与维护

```bash
npm test
npm run test:integration
npm run build
npm run test:http
npm run check:secrets
npm audit
```

集成测试要求独立的 `ai_shop_order_query_test` 数据库（或 `TEST_DATABASE_URL` 指定的 `_test` 结尾数据库）及专用 Redis 15 库；不会访问真实支付平台或发送通知。具体方式见 [CONTRIBUTING.md](CONTRIBUTING.md)。CI 包含构建、资金/库存并发回归、当前文件秘密扫描及依赖审计；历史停用密钥按项目决定保留，当前扫描不替代历史安全审查。

- [安全策略与私密漏洞报告](SECURITY.md)
- [贡献说明](CONTRIBUTING.md)
- [第三方许可证说明](THIRD_PARTY_NOTICES.md)
- [MIT 许可证](LICENSE)

## 许可证

项目代码使用 MIT 许可证。商品、品牌名称只用于演示和描述兼容服务，不表示第三方账号转售授权。实际运营前请自行完成收款联调、数据保护与商品授权核对。
