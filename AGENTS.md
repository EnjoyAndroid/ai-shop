# Codex 开发规范

## 开发前必读

**开始开发前，先阅读 `dev_log.md`**，了解历史问题和注意事项，避免重复踩坑。

功能与部署说明维护在中英文 README 中；涉及交流群入口时，同步核对 `docs/community/README.md`。

## 提交前必须执行

在提交代码和推送到远程仓库之前，**必须**先在本地运行生产构建：

```bash
npm run build
```

只有构建成功后才能提交代码。这可以避免：
- TypeScript 类型错误
- 缺少依赖包
- 客户端/服务端模块引用错误
- 其他生产环境才会暴露的问题

## 常见类型错误

### 1. 数字/字符串类型不匹配
```typescript
// 错误：parseInt 期望 string，但变量已经是 number
parseInt(amount)

// 正确：使用 Number() 兼容两种类型
Number(amount)
```

### 2. 可能为 null 的值
```typescript
// 错误：order.paymentMethod 可能为 null
getPaymentProvider(order.paymentMethod)

// 正确：先检查空值
if (!order.paymentMethod) {
  return NextResponse.json({ error: "支付方式无效" }, { status: 400 });
}
getPaymentProvider(order.paymentMethod)
```

### 3. 服务端模块在客户端使用
如果遇到 `Module not found: Can't resolve 'net'/'dns'/'fs'` 等错误，需要在 `next.config.mjs` 添加：

```javascript
webpack: (config, { isServer }) => {
  if (!isServer) {
    config.resolve.fallback = {
      ...config.resolve.fallback,
      net: false,
      tls: false,
      dns: false,
      fs: false,
      child_process: false,
    };
  }
  return config;
},
```

## 项目特定配置

### 系统默认值
- 订单过期时间: 10 分钟
- 订单自动删除: 90 天

### 已移除功能
- 手机号注册/登录（仅保留邮箱）

## 开发、验收与公网部署边界

- 默认 `.env`、`npm run dev`、数据库脚本和 `docker-compose.yml` 只用于隔离开发环境：`ai-shop-dev`，开发和人工验收共用网页 3013、数据库 55440，Redis 16380。
- 验收使用 `ai-shop-test`、数据库 55441、Redis 16381/15；禁止把生产数据、key、支付或通知凭据复制进开发/验收环境。
- 公网实例为 `ai-shop`，Nginx 固定 `127.0.0.1:3010`，生产配置在忽略的 `.deploy/` 内；开发不修改隧道、生产镜像、生产卷或配置快照。
- “实现功能”“继续开发”“配置好了”不授权发布公网。只有用户明确要求部署该版本，才可运行 `release:deploy`；先完成本地验收并交付具体版本、结果与风险。
- `npm run release:prepare` 只生成并验收固定镜像，不部署生产；发布前备份，生产禁止 demo seed，迁移显式执行。部署只更新 app 并重载 Nginx，不能顺带重建依赖。
- 回退先确认迁移向后兼容，仅切应用镜像；不得自动恢复旧数据库覆盖新订单。

- 配置只保留本地 `.env` 与线上 `.deploy/production.env` 两个人工入口；测试由 `.deploy/test.env` 自动管理。禁止重新引入重复 `.env.local`/`.env.development.local`，状态检查使用 `npm run env:status`，不得输出凭据。

- 本地开发与人工验收共用 `.env`、`ai_shop_dev` 和 Redis 0，候选镜像与开发进程互斥使用 3013。自动化测试仍使用独立 ai-shop-test，临时镜像检查端口为 3014；不得把机器测试接到本地共享库。旧预览数据库保留备份，不自动覆盖本地数据。
