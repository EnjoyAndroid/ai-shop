# AI Shop 智能客服技术文档

## 1. 当前能力

商城提供全站悬浮“智能客服”入口。客服可以回答已发布知识库中的购买、商品、支付、发货、账户、售后和联系方式问题，并读取实时商品库存、价格、启用的支付方式、公告和已授权的本人订单摘要。

客服不会自动购买、付款、取消订单、退款、修改账户或显示卡密。需要人工处理时，面板显示当前配置的微信客服二维码和 Telegram 联系方式。原独立 `/help` 页面已经移除。

系统继续使用现有前台用户和后台管理员鉴权，不新增客服角色。后台知识和客服配置沿用现有管理员权限。

## 2. 数据边界

PostgreSQL 是知识正文和业务数据的唯一事实源。商品、库存、价格、支付和订单状态不写入向量索引，也不由模型记忆回答。客服模型只能使用本轮后端查询返回的事实。

`SupportArticle` 保存标准问题、别名、关键词、分类、正文、状态和发布版本。`DRAFT` 不会被检索，只有 `PUBLISHED` 进入线上回答。保存草稿和发布是轻量的两状态流程，不包含审核流或多人协作。

`SupportConversation`、`SupportTurn` 和 `SupportModelCall` 保存会话、脱敏问答、来源、实时事实摘要、模型调用和用量。会话正文默认保留 30 天，用量记录默认保留 180 天。定时清理会先清除正文、来源、事实和身份关联，保留用量账本；180 天后再清理模型调用明细。

订单查询遵循现有权限：登录用户只能查询本人订单；游客必须完成现有订单查询和密码解锁流程。订单密码、访问 token、卡密和管理员备注不会进入模型上下文。

## 3. 检索实现与迁移路线

第一阶段的 `searchSupportKnowledge` 使用 PostgreSQL 读取已发布条目，按标准问题、别名、关键词、分类和二字符片段进行召回，再由模型组织回答。无模型配置时使用同一批知识和实时事实生成确定性降级回答。

这不是永久排除向量检索。检索层应通过统一的 `KnowledgeRetriever` 接口调用，正文和版本仍由 PostgreSQL 管理，索引属于可重建派生数据。

迁移路线：

```text
阶段一：PostgreSQL 关键词/别名/相似字符串
    ↓ 评测召回率不足
阶段二：PostgreSQL + pgvector 混合召回
    ↓ 规模或并发继续增长
阶段三：PostgreSQL 事实源 + 独立向量库
```

阶段二为已发布条目生成 embedding，使用条目 ID、发布版本、内容哈希和模型版本关联。阶段三只把条目 ID、版本、embedding 和过滤元数据同步到 Qdrant、Milvus 等服务，正文、权限和发布状态仍由 PostgreSQL 控制。新索引先并行评测，再灰度读取，保留旧检索作为回退。

更换 embedding 模型时需要重建向量，但知识正文、版本、对话、用量和业务数据均可保留。pgvector 或独立向量库都不能替代实时业务查询。

## 4. LLM 与 sub2api

商城使用独立的 sub2api 凭据，不能复用 ChatGPT/Codex 桌面应用的 key。线上凭据仅在 `.deploy/production.env` 配置 `SUPPORT_LLM_API_KEY`（本地 `.env` 与自动化测试不读取它），前端和后台只显示是否已配置。

```env
SUPPORT_LLM_PROVIDER=sub2api
SUPPORT_LLM_BASE_URL=http://host.docker.internal:8080/v1
SUPPORT_LLM_API_KEY=REPLACE_WITH_SUPPORT_GATEWAY_KEY
SUPPORT_LLM_MODEL=gpt-6-luna
SUPPORT_LLM_WIRE_API=responses
SUPPORT_DAILY_BUDGET_CNY=10
```

Docker 容器中的 `127.0.0.1` 指向容器自身；sub2api 在宿主机运行时应配置容器可达的地址，例如 Docker Desktop 的 `host.docker.internal`，Linux 部署按实际网络配置。上线前必须在商城容器内验证网关、模型、Responses 接口、工具调用和 usage 返回。

首选模型由真实客服评测决定。`gpt-6-luna` 是低成本候选，`gpt-5.4-mini` 用作质量对照；官方价格只是成本估算，sub2api 的映射和倍率以网关为准。没有 key、模型不可用、预算耗尽或网关错误时，自动降级为知识库和事实回答。

## 5. 请求和安全控制

- 每条消息最多 2,000 字符；请求体有字节上限。
- IP、会话和用户均受 Redis 限流；同一会话不允许并发处理。
- 请求使用 `requestId` 去重，重复提交不会重复调用模型。
- 模型没有 SQL、任意 URL、用户身份或写业务数据的工具。
- 输出只保留客服答案、公开来源和必要事实卡片；不返回 system prompt、内部工具参数或推理正文。
- 上游请求使用 `store: false`，Authorization 永不进入日志。
- 配置、模型和价格修改通过管理员后台；密钥轮换通过部署配置完成。

## 6. Token 与费用统计

每次实际上游调用记录请求模型、响应模型、输入 token、缓存读取、缓存写入、输出 token、推理 token、总 token、耗时、成功状态和价格快照。工具调用后的再次请求、失败请求和重试分别记录。

```text
普通输入 = 总输入 - 缓存读取 - 缓存写入
费用 = 普通输入 × 输入单价
      + 缓存读取 × 缓存单价
      + 缓存写入 × 写入单价
      + 输出 × 输出单价
```

推理 token 已包含在输出 token 中，不重复计费。usage 缺失时标记 `MISSING`，不能按零费用统计。后台提供调用次数、输入/输出/缓存/推理 token、估算美元、失败次数和缺失 usage 数量。

默认每日预算为 10 元人民币。预算按上海时区自然日计算；达到预算后不再发起新的模型请求，但知识库和人工入口继续可用。费率、汇率和预算均可通过服务端配置调整。

## 7. 管理后台

`/admin/support` 包含三个标签：

- **知识库**：新建、编辑、保存草稿和发布；维护标准问题、相似问法、关键词、分类和正文。
- **Token 统计**：查看模型调用、token 分项、成本和 usage 缺失数量。
- **模型配置**：选择模型和每日预算，显示网关和 key 配置状态。

发布后的知识立即进入检索，草稿不会影响线上客服。动态商品、库存、支付和订单信息始终由业务服务实时读取。

## 8. 验收与运维

上线前应验证：

1. 匿名咨询、登录用户本人订单、游客订单密码解锁和充值订单权限。
2. 停售商品、零库存、支付开关、订单状态和客服配置变化能够反映到答案。
3. 草稿不可见，发布可见，旧版本和索引可回退。
4. sub2api 不可用、usage 缺失、超时、限流和预算耗尽均能降级。
5. 模型不会看到密码、卡密、Authorization、内部备注或其他用户数据。
6. 重复 requestId、并发消息、提示注入和恶意 URL 不产生越权或重复扣费。

提交前运行项目既有门禁：

```bash
npm run db:generate
npm test
npm run build
npm run test:integration
npm run test:http
npm run check:secrets
npm run check:history
npm run audit:security
```

