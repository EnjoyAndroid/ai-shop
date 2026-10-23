# 环境隔离与发布

## 配置入口

用户只需维护本地 `.env` 和线上 `.deploy/production.env`；两者不互相覆盖。
`npm run env:init` 会保留已有密码，将内容完全相同的旧 `.env.local`、`.env.development.local` 归档，把旧测试文件移至 `.deploy/test.env`。冲突文件会报错，不擅自选择覆盖。
`npm run env:status` 仅显示位置、是否配置和模型 key 是否填写，不显示密码/密钥。

| 文件 | 是否需要编辑 |
|---|---|
| `.env` | 本地配置，需要时编辑；通常初始化即可 |
| `.deploy/production.env` | 线上模型、邮件、支付等配置的唯一入口 |
| `.deploy/test.env` | 自动生成，保留测试数据库密码，无需编辑 |
| `.deploy/production-images.env` | 发布程序维护的镜像状态，无需编辑 |
| `.env.example` | 本地配置说明模板，不参与运行 |
| `config/production.env.example` | 首次部署参考模板，不参与运行 |
| `.deploy/archive/`、`releases/`、`deployments/` | 归档、验收产物及备份，不是配置入口 |

根目录 `.env.imagegen` 属于图片生成工具，不被商城/Compose/客服读取，本次未改动。

## 环境约定

| 环境 | Compose 项目 | 页面 | PostgreSQL | Redis | 配置 |
|---|---|---|---|---|---|
| 本地开发/人工验收 | ai-shop-dev | 127.0.0.1:3013 | 55440 / ai_shop_dev | 16380 / 0 | .env |
| 自动化验收 | ai-shop-test | 3011（HTTP测试）/ 3014（临时镜像检查） | 55441 / ai_shop_security_test | 16381 / 15 | .deploy/test.env |
| 公网生产 | ai-shop | 127.0.0.1:3010 | 不发布宿主机端口 | 不发布宿主机端口 | .deploy/production.env |

3013 开发模式与候选模式共用 `ai_shop_dev` 和 Redis 0；自动化 HTTP/集成测试使用 `ai_shop_security_test` / Redis 15，镜像检查使用 `ai_shop_image_test` / Redis 14，3014 检查结束后停止。这些机器测试不会清理人工验收数据。旧 `ai_shop_preview_test` 原库及受限备份保留，知识内容已核对一致，不再作为人工验收入口。

开发和验收有不同的网络、数据库账号、随机密钥和数据卷；生产使用原有 `ai-shop_postgres_data` 与 `ai-shop_redis_data`，不复制业务数据，不创建演示数据。即使仅改数据库名称，也不能让测试连接原生产端口。

`.env` 是安全开发配置。命令包装器另外显式选择环境文件、清除继承的业务凭据，阻止 Next 加载其他环境文件；开发/验收的 SMTP、Telegram、支付、Cloudinary、付费模型密钥都为空。生产凭据、固定镜像清单、Nginx 配置快照、备份和验收日志位于 `.deploy/`，权限收紧并同时被 Git / Docker 构建上下文忽略。不要直接打印 Compose 展开的完整配置。

## 日常开发

```bash
npm run env:init       # 不覆盖已有随机密钥
npm run dev:up        # 只启动开发依赖
npm run db:generate
npm run db:prepare    # 仅迁移 ai_shop_dev
npm run db:seed       # 仅开发库演示数据
npm run dev           # 3013，开发缓存为 .next-dev，共用本地数据
```

本地管理员用户名 `admin`，随机密码见 `.env` 的 `ADMIN_PASSWORD`。结束开发可 Ctrl+C，再 `npm run dev:down`；命令不带 `-v`，保留开发数据。测试依赖对应 `npm run test:up` / `npm run test:down`。

直接运行 `npm run build` 使用隔离配置，生产构建缓存为 `.next`。Next 的 `NODE_ENV=production` 表示构建模式，不表示访问公网数据库。`APP_ENV` 用于区分业务环境。模型真实联调应另外配置明确受控的联调环境；不要把生产 key 填进默认开发/测试文件。

## 本地模式切换

- 开发：`npm run dev`。脚本先停止本地候选容器，在同一 3013 端口启动热更新服务。
- 人工验收：先 Ctrl+C 退出开发，再 `npm run release:prepare`；通过全部门禁后自动打开固定镜像模式。
- 切换已通过的候选：`npm run preview -- <release-id>`，同时校验源码指纹和镜像 ID。
- 两种模式共用 `.env`、账号、商品、知识库、订单与缓存，不重建数据库。运行期间 `.deploy/local-runtime.lock` 防止并发切换；占用端口时拒绝操作，不杀死未知进程。
- `.deploy/local-mode.json` 记录当前模式/镜像；`.deploy/local-backups/` 保存切换前数据库备份。原预览库保留，不执行删除卷或数据库恢复。
- 验收期间暂停改代码；页面里的业务操作仍会修改本地数据。重新进入开发需重新验收后再发布，公网发布仍必须明确授权。

## 现有生产接管

本次已经接管原生产配置，并恢复 3010 入口。`.deploy/production-baseline.json` 保存接管时容器、镜像和启动时间；`.deploy/archive/legacy-production*.env` 仅是受限备份，禁止提交。

接管工具 `node scripts/capture-production.mjs --confirm-production` 只用于首次接管已经存在的 `ai-shop-*` 服务，配置已存在则拒绝覆盖。它保留生产凭据，生成全新开发/测试配置，不启动或迁移生产数据库。新建生产站点需要单独配置数据库、管理员和 HTTPS 入口，不得使用开发 seed 初始化真实商店。

生产 Compose 文件不含 `build`，只接受 `.deploy/production-images.env` 内的固定 image ID；数据卷为已存在的外部卷，不会自动创建同名空库。生产 Nginx 挂载 `.deploy/nginx.production.conf` 快照，不挂载正在开发的配置文件。普通 `docker compose up` / `down` 只影响开发项目。

```bash
# 生产只读状态（不展开环境值）
docker compose --env-file .deploy/production.env --env-file .deploy/production-images.env \
  -p ai-shop -f docker-compose.production.yml ps
```

## 验收和镜像

```bash
npm run test:up
npm run release:prepare
```

命令冻结源码内容哈希，顺序运行：干净依赖安装、Prisma 生成、单元测试、隔离集成、生产构建、HTTP 验收、秘密/提交历史/diff 检查、Docker 构建、固定镜像迁移与预览健康检查、依赖审计。构建与 TypeScript/HTTP 测试不能同时争用 `.next`。

镜像使用独立 `ai-shop-release:<时间-源码哈希>` 标签，并记录不可变 image ID。它不覆盖运行网站曾使用的 `ai-shop-app:latest`。镜像先用自动化测试数据在 3014 检查并停止；全部门禁通过后，3013 切换到同一个固定镜像，连接 `.env` 对应的本地数据库与 Redis，不连接公网隧道。切换前备份本地数据库、显式迁移，不执行 seed。

结果在 `.deploy/releases/<release-id>/manifest.json`，每个门禁有单独日志。任何失败或运行期间源码变化都不能产生 `approved: true`。依赖审计发现新风险不会自动运行破坏性升级，也不能跳过该门禁。演示预览可供检查，但未通过的候选不能发布。

这套本地门禁防止误操作，不代替具备管理权限人员的授权，也不是抵御本机管理员篡改的签名系统。

## 明确授权后发布

“实现功能”“继续开发”“配置好了”只授权开发。应先提交版本、结果、迁移说明及回退兼容性供用户审阅；用户明确要求部署该版本后才执行：

```bash
npm run release:deploy -- <release-id> --confirm-production
```

发布命令拒绝缺失门禁、变动源码、被替换镜像，并取得全局发布锁。步骤：

1. 检查当前生产数据库 image ID 与固定配置一致，配置漂移则停止。
2. `pg_dump -Fc` 备份当前生产库，保存当前应用镜像、生产环境和 Nginx 快照；备份失败不继续。
3. 使用已验收镜像显式运行增量迁移，不运行 seed；迁移失败不切应用。
4. 用 `up --no-deps --no-build --pull never app` 仅替换应用，不重建 PostgreSQL、Redis或Nginx。
5. 校验并重载 Nginx，使它重新解析应用容器地址；验证本机与公网 `/api/health`。
6. 保存 `.deploy/deployments/<deployment-id>/deployment.json`。公网其他关键页面与新功能按本次变更继续检查。

生产发布使用已有数据库和加密密钥，修改加密密钥不是部署的一部分。生产配置修改需要单独审阅并显式重建应用才生效；修改开发文件不会影响正在运行的镜像。

## 回退与失败处理

应用健康失败时记录失败阶段，不擅自恢复旧数据库。先审查迁移是否向后兼容；兼容时，经明确授权：

```bash
npm run release:rollback -- <deployment-id> --confirm-production
```

只切换回记录的旧应用 image ID、重载代理并检查本机与公网健康。不执行 down-migration，不恢复旧数据库覆盖新订单。当前镜像与记录不一致时拒绝过期回退。

数据库恢复是另一项受控操作：先暂停写入、保留当前库、验证备份并确定新订单处理方法，再安排恢复窗口。不能把镜像回退等同于完整数据库回退。

若流程被强制终止留下 `.deploy/release.lock`，先读取 PID 并确认没有在途构建/部署，再移除锁；不要在发布仍执行时删除。配置及备份保留在本机，需按既有备份政策另行保存，镜像也不能在回退窗口内清理。
