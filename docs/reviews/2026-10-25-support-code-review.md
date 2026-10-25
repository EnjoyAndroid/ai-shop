# 智能客服发布前代码审核

本次审核覆盖 `302b603` 之后的工作区改动，以及客服调用、预算、清理等直接依赖链。发现五项应在发布前修复的问题，均已在本轮代码中修复并加入针对性回归。无数据库结构或依赖版本变更。最终构建、HTTP、依赖检查及3013镜像状态以 `.deploy/support-review-checkpoint.json` 为准；未提交、推送或部署公网。

## 范围与方法

用户已授权审核、修复和开发验收。范围为 TypeScript/Next.js 客服管理接口、账号按需查看、配置、风控、统计、会话恢复、模型/工具调用、预算预占/结算和前台/后台界面。未修改真实业务数据、生产配置、支付和通知凭据。

检查信任边界：浏览器输入 → 同源校验/管理员或用户会话 → 服务端策略 → Prisma/Redis → 模型网关 → 只读工具 → 输出和审计。逐一人工追踪输入、鉴权和序列化；配合危险API模式搜索、项目秘密/历史检查、依赖审计和隔离数据库/HTTP测试。当前环境无 Semgrep，未声称完成 Semgrep/CodeQL 全库扫描；此次为变更范围人工审核，不代表不存在所有潜在漏洞。

## 发现、证据与修复

| 编号 | 严重度 | 触发路径与影响 | 修复及验证 |
|---|---|---|---|
| F1 | P1 | 缩短保留期后、小时清理前，普通统计、模型调用关联问答、搜索、风控原始字段和会话恢复仍可能暴露超期正文/身份/IP；短保留期可小于会员会话寿命。 | 查询按当前保留期过滤；调用账本保留但关联问答DTO清除正文、身份、IP、请求/会话标识；搜索不匹配超期内容；会话恢复、上下文、重放同样检查期限；超期记录不能再作为封禁来源。E1、E2。 |
| F2 | P1 | 清理先在事务外读取保留期，管理员随后延长保留期，已启动任务仍会依据旧值不可逆清理。 | 配置保存与清理共用配置事务锁，清理取得锁后在同一事务内读取策略。真实数据库锁等待用例验证延长保留期后记录仍保留。E3。 |
| F3 | P2 | 规划失败转为 `SCOPE_UNAVAILABLE` 后未计入熔断；另一方面预算耗尽会被当成上游失败，造成不必要熔断。 | 规划失败计入失败，正常拒答/澄清恢复成功状态；预算、输入限制和取消不计为网关故障。连续三次规划503后拦截后续模型请求，FAQ继续可用。E4。 |
| F4 | P2 | 已在等待的工具Promise不观察AbortSignal，工具卡住时65秒总时限不能结束模型循环。 | 等待工具结果同时监听取消/超时，正常完成时移除监听；取消后禁止新模型调用和迟到工具资料写入。规划工具、后续工具、取消和超时分别验证。E5。 |
| F5 | P2 | 日预算在取得预算锁前读取，排队请求可能在管理员调低预算后仍用旧值预占。 | 取得日预算锁后读取预算；配置保存共享该锁。真实数据库锁等待用例验证预算改为0后排队请求不预占、不创建模型调用。E6。 |

同时让模型请求中的输出Token参数直接使用固定常量，保持发送值、预算预占和后台展示一致。

## 证据与复现

以下全部使用合成数据和独立 `ai-shop-test`，禁止改为生产或共享开发库。

```bash
npm run test:up
node --import tsx --test tests/support-agent.test.ts tests/support-risk.test.ts tests/support-account-mask.test.ts
npm run test:integration
npm run release:prepare
```

`release:prepare`包含构建、HTTP及镜像等12项门禁，通过后切换3013；不发布公网。最终源码及输入在此阶段冻结，日志和版本由检查点关联。

| 证据 | 路径/独立预期 |
|---|---|
| E1 | `tests/integration/security.test.ts`：`retention protects call DTOs, searches, risk events and conversation replay before cleanup`；合成记录尚未物理清理，调用Token保留，正文、账号/IP及搜索结果不可见，会话恢复为空，重复requestId返回410。 |
| E2 | `scripts/smoke-security.mjs`：超期关联问答仍有用量记录时，真实HTTP调用列表返回脱敏DTO，按旧问题搜索无命中；未登录和普通管理员仍403，成功响应no-store。 |
| E3 | `tests/integration/security.test.ts`：`cleanup reads retention after config commits while holding the same lock`；观察 `pg_stat_activity` 确认清理等待锁，写入较长保留期后释放，旧记录不被清除。 |
| E4 | 同上：`planner failures open the circuit; exhausted budget does not; FAQ stays available`；三次预算拒绝零网关调用、无熔断；三次规划503后第四次不调用网关，FAQ仍正常。 |
| E5 | `tests/support-agent.test.ts`：`planned and follow-up tools stop on cancellation without another model call`、`a tool that never completes is bounded by the total model deadline`；使用永不完成的合成工具，验证取消/超时结束循环，无后续模型调用。 |
| E6 | `tests/integration/security.test.ts`：`queued budget reservations read the new budget after acquiring the day lock`；真实预算锁阻塞期间将预算改0，释放后返回false且无调用行。 |

原始实现备份及中间日志位于 `.deploy/support-review/`。一次旧回归失败来自夹具固定在2023年，已改为近期相对时间，保留“超过20轮仍取得最新上下文”的原始预期。首次依赖审计因沙箱无法解析npm注册表失败，不能解释为依赖安全；最终须以完整门禁的audit结果判断。

## 其余核对结果

- 管理员接口继续校验数据库角色、状态及会话版本；账号查看使用POST、同源检查、限流和no-store，审计事务成功后才返回原文。
- 默认问答和风险列表不序列化原始账号；审计只存关联ID。眼睛切换的取消/筛选/分页/标签重置逻辑保持，React文本渲染无新增HTML注入入口。
- 配置严格字段白名单与范围校验；固定Token/并发等字段不能通过配置接口写入。用量保留期不能短于明细。
- 数据库预算事务、Redis原子准入、请求幂等及租约释放保留；工具列表及参数白名单、订单服务端用户绑定保持。
- 无生产域名、网关凭据或个人信息复制到测试；未变更数据库迁移、依赖锁文件和发布脚本。

## 实际边界与回退

- 工具超时停止等待和后续模型调用；Prisma已发出的只读SQL不能用AbortSignal强制取消，数据库仍需自身超时/连接容量保护。本轮未增加数据库层statement_timeout，也未进行真实供应商压力测试。
- 物理清理仍由定时任务分批执行；读取端立即按保留期隐藏，延长保留期无法恢复已清理的数据。
- 每分钟配置仍受现有基础请求限流（身份/IP每分钟30次）及其他硬安全限制影响；单IP每天500次、身份/IP/全站并发1/3/8和重复冷却保持原值，本轮没有扩大额度。
- 没有结构迁移，应用回退不需要恢复旧数据库。但旧版本只理解90/180天固定保留期：若新环境将保留期延长，直接回退可能让旧清理器提前删除数据。回退前必须核对实际配置并使用保留读取/清理修复的回退构建；禁止恢复旧数据库覆盖新订单。
- 生产部署仍需明确授权；提交前应确认最终源码指纹与验收候选一致。
