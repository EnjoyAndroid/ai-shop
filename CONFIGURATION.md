# 配置只看这两个文件

| 要配置什么 | 编辑哪里 |
|---|---|
| 本地开发/人工验收网站（3013）的配置 | `.env` |
| 线上商城的模型 key、邮件、支付等 | `.deploy/production.env` |

当前线上 sub2api 配置已经保留在 `.deploy/production.env`，不用重新填写，也不用复制到其他文件。

## 配置智能客服

线上使用 `.deploy/production.env`；3013 开发/人工验收使用 `.env` 中单独配置的专用模型凭据。这几项决定模型接入：

```dotenv
SUPPORT_LLM_PROVIDER=sub2api
SUPPORT_LLM_BASE_URL=http://host.docker.internal:8080/v1
SUPPORT_LLM_API_KEY=REPLACE_WITH_SHOP_GATEWAY_KEY
SUPPORT_LLM_MODEL=gpt-6-luna
SUPPORT_LLM_WIRE_API=responses
```

上面的地址适用于网关运行在 Docker Desktop 宿主机；其他部署填写对应地址。保留原有数据库密码、登录密钥和卡密加密密钥，不要用模板覆盖整份配置。

**修改线上配置后不会立即生效。** 仍需通过显式授权的部署流程更新应用，不会因本地开发自动更新公网。

本地开发仍禁止真实支付、通知等凭据。3013 允许使用 `.env` 的专用客服模型 Key；未配置时使用知识库降级回答，不自动复制线上 Key。配置 `SUPPORT_DAILY_BUDGET_CNY` 可控制每日预算，不填写时使用后台预算。修改后重启本地开发进程或重新激活候选容器。自动化测试仍拒绝外部模型凭据，不会随人工联调消耗额度。

## 初始化与检查

```bash
npm run env:init    # 自动初始化/整理，保留已有密码
npm run env:status  # 只显示位置和配置状态，不显示密钥
```

首次初始化无需手动编辑数据库连接；脚本生成独立开发和测试密码。正常开发直接运行 `npm run dev:up` 和 `npm run dev`。

## 本地只用一个地址

商城：`http://127.0.0.1:3013/`；后台：`http://127.0.0.1:3013/admin/login`。
开发模式和固定候选模式使用相同的数据库、Redis、管理员、商品和知识库，统一读取 `.env`。

```bash
npm run dev:up
npm run dev              # 修改代码、即时刷新；会先停止本地候选容器
```

准备人工验收时先 Ctrl+C 退出开发，再运行 `npm run release:prepare`。全部门禁通过后自动切换到固定候选镜像，地址仍是 3013。已有通过验收的候选可用 `npm run preview -- <release-id>` 切换。脚本不允许开发进程和切换过程并发，不会终止未知进程。

管理员用户名 `admin`，首次密码取自 `.env` 的 `ADMIN_PASSWORD`。该变量仅用于首次初始化，已有密码通过后台修改；切换模式不创建新账号、不重置密码或导入 seed。

自动化测试使用独立库，临时镜像检查使用 3014，由脚本自动启动并停止，无需你登录。旧预览库保留归档，不再作为日常人工验收的数据源。

## 其他文件不用配置

- `.env.example`、`config/production.env.example`：参考模板，不参与运行。
- `.deploy/test.env`：自动化测试凭据，脚本维护，无需编辑。
- `.deploy/production-images.env`：固定镜像状态，发布脚本维护。
- `.deploy/archive/`：整理前的历史备份，无需编辑。
- `.env.imagegen`：图片生成工具专用配置，不参与商城或客服运行。

旧的 `.env.local`、`.env.development.local`、`.env.test.local` 已归档，不再作为商城配置入口。完整开发与发布步骤见 [环境隔离指南](docs/operations/environments.md)。
