# 贡献说明

开发前阅读 `dev_log.md`。安装 Node.js 22.14+、PostgreSQL 15+ 和 Redis 7+，执行 `npm run env:init` 生成独立开发/测试配置，按 [环境隔离指南](docs/operations/environments.md) 启动依赖。生产配置只能保存在 `.deploy/`。

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

本地集成测试固定连接独立 `ai-shop-test` 容器（55441 / 16381），数据库必须以 `_test` 结尾、Redis 必须为 15 库；CI 使用显式指定的临时服务。拒绝生产端口和外部服务凭据，测试不调用支付、通知或付费模型。生产仅通过用户明确授权后的 `release:deploy` 更新。

历史邮箱检查需要完整检出，只输出提交位置。提交及 GitHub 网页编辑均应使用 GitHub noreply 或约定的公开示例身份。`npm audit` 仍可能报告已由源码补丁缓解的 braces 公告；`audit:security` 会校验补丁并拒绝其他告警，维护要求见 [安全说明](docs/security.md#验证与依赖维护)。不要关闭安装脚本或降低整个审计阈值。

数据库变更提交 Prisma schema 与 SQL migration；不得通过重置数据库掩盖升级问题。并发、权限和资金变更需要失败重试及回归测试。日志使用 `src/lib/logger.ts`，不记录凭据、明文卡密和完整第三方响应。

Dependabot 将 npm 的 minor/patch 更新合并为一个 PR，GitHub Actions 更新按组提出；Prisma、React 和 Next/ESLint 的 major 更新分别分组，需成套检查兼容性。分组不等于自动合并，仍以当前版本的 CI 和人工审查为准。

PR 的邮箱检查仅排除与 GitHub 事件和两个父提交都匹配的临时测试合并提交元数据，仍检查全部真实提交；构建和测试继续运行在 PR 合并结果上。推送到 main 后不使用该排除规则。

提交贡献即确认有权以项目 MIT 许可证提供贡献；引入第三方素材或代码时附上来源和许可证。安全问题请按 SECURITY.md 私密报告。
