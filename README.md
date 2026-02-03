# AI Shop - AI 服务自助充值系统

> 一个类似 tehuio.com 的虚拟商品自动发卡平台，支持 ChatGPT、Claude、Cursor 等 AI 服务的自助购买。

![Next.js](https://img.shields.io/badge/Next.js-14.2-black?logo=next.js)
![TypeScript](https://img.shields.io/badge/TypeScript-5.0-blue?logo=typescript)
![Tailwind CSS](https://img.shields.io/badge/Tailwind-3.4-38B2AC?logo=tailwind-css)
![Prisma](https://img.shields.io/badge/Prisma-5.22-2D3748?logo=prisma)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-336791?logo=postgresql)

## ✨ 功能特性

### 🛒 商品系统
- 分类展示（ChatGPT / Claude / Cursor / Midjourney 等）
- 商品管理（CRUD、排序、上下架、图片上传）
- 卡密库存管理（批量导入、AES-256-GCM 加密存储）

### 👤 用户系统
- 注册/登录（邮箱）
- 滑块验证码（防机器人注册）
- 登录保护（失败3次后触发验证码）
- 密码策略（最小8位）
- 前端表单验证（邮箱格式、密码长度）
- 会员等级（消费累计自动升级）
- 折扣价格（不同等级不同折扣）
- 余额充值与支付

### 📦 订单系统
- 自助下单（游客/会员）
- 自动发货（支付成功后自动分配卡密）
- 订单查询（查询密码保护）
- 订单自动过期与清理

### 💳 支付系统
- 支付宝（虎皮椒聚合支付）
- 微信支付（虎皮椒聚合支付）
- USDT TRC20/ERC20
- 余额支付

### 🔧 后台管理
- 仪表盘（销售统计、数据概览）
- 商品管理、分类管理
- 卡密管理（批量导入、状态查询）
- 订单管理（查看、手动发货、退款）
- 用户管理（查看、余额调整、封禁）
- 公告管理（富文本格式、链接、颜色）
- 系统设置

### 🔒 安全机制
- 防刷单（IP / 设备指纹 / 邮箱限流，Lua脚本原子操作）
- 卡密加密存储（AES-256-GCM + PBKDF2密钥派生）
- 支付回调签名验证
- Redis 分布式锁
- 后台 API 权限验证（middleware + getAdminSession）
- 管理员登录失败限流（5次锁定30分钟）
- 公告富文本 XSS 防护（URL协议白名单）
- 加密安全随机数生成（crypto.randomInt）

## 🛠️ 技术栈

| 层级 | 技术选择 |
|------|----------|
| 前端框架 | Next.js 14 (App Router) |
| UI 组件 | Tailwind CSS |
| 状态管理 | Zustand + React Query |
| ORM | Prisma |
| 数据库 | PostgreSQL |
| 缓存 | Redis |
| 认证 | NextAuth.js v5 |

## 📁 项目结构

```
ai-shop/
├── prisma/
│   ├── schema.prisma          # 数据库模型
│   ├── seed.ts                # 种子数据 (TypeScript)
│   └── seed.sql               # 种子数据 (SQL)
├── src/
│   ├── app/
│   │   ├── (shop)/            # 前台商城
│   │   │   ├── page.tsx       # 首页
│   │   │   ├── category/      # 分类页
│   │   │   ├── product/       # 商品详情
│   │   │   ├── checkout/      # 结算页
│   │   │   ├── order/         # 订单查询
│   │   │   └── help/          # 使用帮助
│   │   ├── (auth)/            # 认证页面
│   │   │   ├── login/         # 登录
│   │   │   └── register/      # 注册
│   │   ├── (user)/            # 用户中心
│   │   │   ├── dashboard/     # 个人中心
│   │   │   ├── orders/        # 我的订单
│   │   │   └── balance/       # 我的余额
│   │   ├── admin/             # 后台管理
│   │   │   ├── dashboard/     # 仪表盘
│   │   │   ├── products/      # 商品管理
│   │   │   ├── categories/    # 分类管理
│   │   │   ├── orders/        # 订单管理
│   │   │   ├── cardkeys/      # 卡密管理
│   │   │   ├── users/         # 用户管理
│   │   │   └── settings/      # 系统设置
│   │   └── api/               # API 路由
│   ├── components/
│   │   ├── shop/              # 商城组件
│   │   └── admin/             # 后台组件
│   ├── lib/
│   │   ├── db.ts              # Prisma 客户端
│   │   ├── redis.ts           # Redis 客户端
│   │   ├── auth.ts            # NextAuth 配置
│   │   ├── encryption.ts      # 加密工具
│   │   ├── services/          # 业务服务
│   │   ├── payment/           # 支付集成
│   │   └── validations/       # Zod 验证
│   └── stores/
│       └── cart.ts            # 购物车状态
├── docker-compose.yml         # Docker 编排配置
├── Dockerfile                 # Docker 构建文件
├── nginx.conf                 # Nginx 配置
├── package.json
├── tailwind.config.ts
└── .env.example
```

## 🚀 快速开始

### 环境要求

- Node.js 18+
- PostgreSQL 14+
- Redis 6+（可选，开发环境可不配置）

### 本地开发

1. **克隆项目**
```bash
git clone <repository-url>
cd ai-shop
```

2. **安装依赖**
```bash
npm install
```

3. **配置环境变量**
```bash
cp .env.example .env
```

编辑 `.env` 文件，配置以下必要信息：

```env
# 数据库连接
DATABASE_URL="postgresql://user:password@localhost:5432/ai_shop"

# Redis 连接（可选）
REDIS_URL="redis://localhost:6379"

# NextAuth 密钥
NEXTAUTH_URL="http://localhost:3000"
NEXTAUTH_SECRET="your-secret-key"

# 卡密加密密钥
ENCRYPTION_KEY="your-32-bytes-encryption-key"
```

4. **初始化数据库**
```bash
# 生成 Prisma 客户端
npm run db:generate

# 推送数据库结构
npm run db:push

# 运行种子数据
npm run db:seed
```

5. **启动开发服务器**
```bash
npm run dev
```

6. **访问网站**
- 前台商城: http://localhost:3000
- 后台管理: http://localhost:3000/admin/login

### 测试账号

| 角色 | 账号 | 密码 |
|------|------|------|
| 管理员 | admin | admin123 |

## 🐳 Docker 部署 (生产环境)

### 1. 准备服务器

- VPS（推荐 Rocky Linux 9 / Ubuntu 22.04）
- 已安装 Docker 和 Docker Compose
- 域名已解析到服务器 IP

### 2. 上传代码

```bash
# 克隆项目到服务器
git clone <repository-url> /home/ai-shop
cd /home/ai-shop
```

### 3. 配置环境变量

```bash
cp .env.production .env
nano .env
```

修改以下配置：

```env
# 数据库密码
DB_PASSWORD=YourSecurePassword123

# 站点配置
NEXTAUTH_URL=https://your-domain.com
NEXT_PUBLIC_SITE_URL=https://your-domain.com
NEXTAUTH_SECRET=your-random-secret-key

# 加密密钥
ENCRYPTION_KEY=your-32-bytes-key

# 信任域名（重要！）
AUTH_TRUST_HOST=true
```

### 4. 配置 Cloudflare（推荐）

1. 在 Cloudflare DNS 添加 A 记录指向服务器 IP
2. SSL/TLS 设置选择 "Flexible"
3. 开启代理（橙色云朵）

### 5. 启动服务

```bash
# 开放端口
firewall-cmd --permanent --add-port=80/tcp
firewall-cmd --reload

# 构建并启动
docker compose up -d --build

# 查看日志
docker compose logs -f
```

### 6. 初始化数据库

```bash
# 推送数据库结构
docker compose exec app node ./node_modules/prisma/build/index.js db push

# 导入种子数据
docker compose exec -T postgres psql -U aishop -d ai_shop < prisma/seed.sql
```

### 7. 验证部署

```bash
# 检查容器状态
docker compose ps

# 检查数据
docker compose exec postgres psql -U aishop -d ai_shop -c "SELECT name FROM \"Category\";"
```

访问 https://your-domain.com 测试

### 常用运维命令

| 操作 | 命令 |
|------|------|
| 查看状态 | `docker compose ps` |
| 查看日志 | `docker compose logs -f app` |
| 重启应用 | `docker compose restart app` |
| 停止所有 | `docker compose down` |
| 更新部署 | `git pull && docker compose up -d --build` |
| 备份数据库 | `docker compose exec postgres pg_dump -U aishop ai_shop > backup.sql` |

## 📖 使用指南

### 添加商品

1. 登录后台管理 `/admin/login`
2. 进入分类管理，创建商品分类
3. 进入商品管理，点击"添加商品"
4. 填写商品信息并保存

### 导入卡密

1. 进入卡密管理 `/admin/cardkeys`
2. 选择商品
3. 粘贴卡密内容（每行一个）
4. 点击"导入卡密"

### 配置支付

1. 进入系统设置 `/admin/settings`
2. 开启需要的支付方式
3. 在 `.env` 中配置支付参数：

```env
# 虎皮椒支付
XUNHU_APPID="your-appid"
XUNHU_APPSECRET="your-secret"

# USDT 收款地址
USDT_TRC20_ADDRESS="your-trc20-address"
USDT_ERC20_ADDRESS="your-erc20-address"
```

## 🗄️ 数据库模型

```
User ──< Order ──< OrderItem >── Product >── Category
                      │
                      └──< CardKey
```

主要表：
- `User` - 用户信息、会员等级、余额
- `UserLevel` - 会员等级定义
- `Category` - 商品分类
- `Product` - 商品信息
- `CardKey` - 卡密库存（加密存储）
- `Order` - 订单主表
- `OrderItem` - 订单明细
- `BalanceLog` - 余额变动日志
- `PaymentLog` - 支付日志
- `Admin` - 管理员
- `Announcement` - 公告
- `SystemSetting` - 系统设置

## 🔐 安全说明

### 卡密加密

卡密使用 AES-256-GCM 算法加密存储，确保数据库泄露时卡密内容不会被直接获取。

```typescript
// 加密存储
const encrypted = encrypt(cardKeyContent);
// 存储: encrypted.content, encrypted.iv, encrypted.tag

// 解密读取
const decrypted = decrypt({ content, iv, tag });
```

### 防刷单机制

基于 Redis 实现多维度限流（使用 Lua 脚本保证原子性）：
- IP 限制：每分钟最多 10 次请求
- 邮箱限制：每小时最多 10 次下单
- 设备指纹限制：每小时最多 10 次下单
- 管理员登录：5次失败后锁定30分钟

### 支付安全

- 所有支付回调都验证签名
- 使用分布式锁防止重复处理
- 订单状态机保证流程正确

## 📝 开发计划

- [x] Phase 1: MVP（商品展示、订单系统、支付集成）
- [x] Phase 2: 用户系统（注册/登录、会员等级）
- [x] Phase 3: Docker 部署支持
- [x] Phase 4: 滑块验证码、登录保护
- [x] Phase 5: 商品图片上传、系统配置生效
- [x] Phase 6: 运营功能（公告系统、富文本格式）
- [x] Phase 7: 安全加固（API权限验证、限流优化、XSS防护、密钥派生增强）
- [ ] Phase 8: 数据报表、邮件通知
- [ ] Phase 9: 监控告警、性能优化

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！

## 📄 许可证

MIT License

## 📞 联系方式

如有问题或建议，请通过以下方式联系：

- 提交 Issue
- 发送邮件

---

**⚠️ 免责声明**

本项目仅供学习交流使用，请遵守当地法律法规。使用本系统进行的任何商业行为，开发者不承担任何责任。
