# AI Shop

基于 Next.js、TypeScript、PostgreSQL、Prisma 和 Redis 的自托管数字商品商城，支持游客下单、卡密库存、会员余额和后台管理。

项目代码使用 MIT 许可证。商品、品牌名称只用于演示和描述兼容服务，不表示第三方账号转售授权。实际运营前请自行完成收款联调、数据保护与商品授权核对。

## 功能与边界

- 邮箱注册/登录、会员等级、余额记录。
- 分类、商品、加密卡密、订单、公告和系统设置管理。
- 支付宝/微信虎皮椒回调；USDT TRC20 固定报价及已确认交易精确匹配。ERC20 自动收款未开放。
- 数据库事务保障余额、订单、库存与支付流水认领的一致性；重复回调不会重复入账。
- 登录、注册、重置邮件、上传等操作限流；滑块图片服务端生成，验证令牌一次性使用。
- 后台角色分工：OPERATOR 处理商品及发货；ADMIN 可管理用户和财务；SUPER_ADMIN 可修改系统设置。所有角色可修改自己的密码，改密后会话失效。

**订单查询规则**：无需登录即可购买。游客订单需要订单号和查询密码；会员订单按产品设计仅凭订单号即可查询及取卡。请将订单号视为敏感领取凭据。本版本没有强制会员订单归属校验，详见 [SECURITY.md](SECURITY.md)。

**退款与通知**：余额退款自动退回站内余额；外部支付退款需先在支付平台人工完成，后台操作只登记退款结果。邮件/Telegram 通知失败不会重新入账，需监控并补发。示例商品不含可售卡密。

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

集成测试要求独立的 `ai_shop_security_test` 数据库（或 `TEST_DATABASE_URL` 指定的 `_test` 结尾数据库）及专用 Redis 15 库；不会访问真实支付平台或发送通知。具体方式见 [CONTRIBUTING.md](CONTRIBUTING.md)。CI 包含构建、资金/库存并发回归、当前文件秘密扫描及依赖审计；历史停用密钥按项目决定保留，当前扫描不替代历史安全审查。

- [安全策略与私密漏洞报告](SECURITY.md)
- [贡献说明](CONTRIBUTING.md)
- [第三方许可证说明](THIRD_PARTY_NOTICES.md)
- [MIT 许可证](LICENSE)
