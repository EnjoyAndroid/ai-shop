# 贡献说明

开发前阅读 `dev_log.md`。安装 Node.js 22.14+、PostgreSQL 15+ 和 Redis 7+，复制 `.env.example` 并配置独立随机密钥。

提交前运行：

```bash
npm ci
npm run db:generate
npm test
npm run test:integration
npm run build
npm run test:http
npm run check:secrets
npm audit
```

集成测试只能连接名称以 `_test` 结尾的独立数据库，Redis 使用测试专用 15 库；可以通过 `TEST_DATABASE_URL` 和 `TEST_REDIS_URL` 配置。测试不调用支付网关或通知服务。

数据库变更提交 Prisma schema 与 SQL migration；不得通过重置数据库掩盖升级问题。并发、权限和资金变更需要失败重试及回归测试。日志使用 `src/lib/logger.ts`，不记录凭据、明文卡密和完整第三方响应。

提交贡献即确认有权以项目 MIT 许可证提供贡献；引入第三方素材或代码时附上来源和许可证。安全问题请按 SECURITY.md 私密报告。
