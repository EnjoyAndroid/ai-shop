# 贡献说明

开发前阅读 `dev_log.md`。安装 Node.js 22.14+、PostgreSQL 15+ 和 Redis 7+，复制 `.env.example` 并配置独立随机密钥。

README 维护项目介绍、快速部署和必要配置；开发过程、调试问题与验证记录放在 `dev_log.md`。功能或配置文档变更同步中英文版本。

提交前运行：

```bash
npm ci
npm run db:generate
npm test
npm run test:integration
npm run build
npm run test:http
npm run check:secrets
npm run check:history
npm run audit:security
```

集成测试只能连接名称以 `_test` 结尾的独立数据库，Redis 使用测试专用 15 库；可以通过 `TEST_DATABASE_URL` 和 `TEST_REDIS_URL` 配置。测试不调用支付网关或通知服务。

历史邮箱检查需要完整检出，只输出提交位置。提交及 GitHub 网页编辑均应使用 GitHub noreply 或约定的公开示例身份。`npm audit` 仍可能报告已由源码补丁缓解的 braces 公告；`audit:security` 会校验补丁并拒绝其他告警，维护要求见 [安全说明](docs/security.md#验证与依赖维护)。不要关闭安装脚本或降低整个审计阈值。

数据库变更提交 Prisma schema 与 SQL migration；不得通过重置数据库掩盖升级问题。并发、权限和资金变更需要失败重试及回归测试。日志使用 `src/lib/logger.ts`，不记录凭据、明文卡密和完整第三方响应。

Dependabot 将 npm 的 minor/patch 更新合并为一个 PR，GitHub Actions 更新按组提出；Prisma、React 和 Next/ESLint 的 major 更新分别分组，需成套检查兼容性。分组不等于自动合并，仍以当前版本的 CI 和人工审查为准。

提交贡献即确认有权以项目 MIT 许可证提供贡献；引入第三方素材或代码时附上来源和许可证。安全问题请按 SECURITY.md 私密报告。
