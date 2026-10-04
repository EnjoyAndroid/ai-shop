# 开发日志

## 2026-10-04 发布展示素材与更新 README

- README 功能介绍重写为买家体验、管理运营、支付通知和数据保护；补充邮箱缓存、独立查询页、移动端和共享会员导航。
- 查询密码/凭证细节移入 SECURITY.md，空订单表迁移限制保留在升级章节；邮箱用途描述为查询与可选通知，不承诺必发卡密邮件。
- 展示首页、视频封面、19 张截图索引及买家/管理功能折叠图集随文档发布至 GitHub。

## 2026-10-04 项目展示素材

- 独立 ai_shop_showcase_test 数据库与临时应用副本采集商城、下单、发货、查询、会员、余额、管理后台及手机界面，使用合成账号与 DEMO-ONLY 卡密。
- 19 张真实页面截图整理至 docs/screenshots；合成 86 秒 1080p H.264 字幕导览，明确标注非连续录屏。
- README 新增首页大图、视频链接及买家/管理功能折叠展示；docs/showcase 提供完整素材索引与采集说明。
- 演示实际完成余额付款、会员折扣、自动发货与密码解锁；未调用第三方付款或外部通知，不修改业务数据库。

## 2026-10-04 个人中心切换加载体验

- 个人中心、订单和余额共用用户布局，顶部导航与侧栏在内部切换期间保留，充值页复用同一布局。
- 导航按当前路由高亮，预加载目标页，等待时显示切换状态；加载骨架与失败重试仅替换右侧内容。
- 每页保留服务端登录和订单归属校验，账户信息移入个人中心内容卡片，避免导航结构在切换时跳动。
- 验证：本地及 Docker 生产构建通过；隔离浏览器确认三页切换导航节点保留，充值加载时仅右侧出现骨架、导航可操作，手机横排切换正常。HTTP 检查每页仅有一份 Header 与公共侧栏。

## 2026-10-04 导航移除账号信息

- 商城服务端及客户端导航移除账号昵称/完整邮箱，保留个人中心与退出入口。
- 手机抽屉同步移除账号信息块，不再向导航组件传递账号名称。
- 验证：本地与 Docker 生产构建通过，已更新本机商城；真实 HTTP 已登录商品页导航检查通过，保留个人中心/退出且不含账号邮箱。

## 2026-10-04 下单邮箱提示与订单密码自动填充

- 商品页邮箱提示改为“请输入邮箱”，不将邮箱用途限定为接收卡密。
- 订单查询密码使用独立输入名称、autocomplete=off 与常见密码管理器忽略标记；支持 text-security 的浏览器使用视觉遮罩的文本输入，减少与本站登录密码关联并触发覆盖提示。老旧浏览器不支持遮罩时保留原生密码遮罩。
- 下单与公共详情解锁均使用订单模式，显示/隐藏功能保留；账号登录、注册、改密仍使用原生密码输入。
- 验证：本地与 Docker 生产构建通过，已更新本机商城；浏览器确认订单输入为 text/自动填充关闭、默认 disc 遮罩、placeholder 不遮罩以及显示/隐藏切换。浏览器及扩展策略不同，不能保证所有密码管理器完全不提示。

## 2026-10-04 商品详情双栏等高

- 桌面双栏中商品图片区域随购买信息卡片等高，移除桌面固定正方形比例；图片保持比例居中铺满，无图片占位也同步拉伸。
- 手机单栏保留正方形图片展示。
- 验证：本地及 Docker 生产构建通过，已更新本机商城；桌面实测两栏同为 806px 高、顶底对齐，390px 手机视口保持正方形图片且无横向溢出。

## 2026-10-04 邮箱查询浏览器缓存

- 查询入口增加可点击填入、逐个删除的邮箱缓存标签，localStorage 持久保存最近 3 个去重邮箱，重新查询成功后置顶。
- 仅查询 API 成功后保存邮箱（包括成功返回空列表）；订单号、验证码未通过、取消或查询失败不保存。不自动执行查询或恢复列表。
- 缓存内容校验后读取，存储不可用时正常查询；其他标签页的缓存删除和更新同步显示。
- 验证：缓存上限、大小写规范化/去重置顶、逐个删除、订单号拒绝写入、损坏数据与禁用存储检查通过；本地与 Docker 生产构建通过，已更新本机商城并确认容器健康。

## 2026-10-04 分离订单查询入口与结果页

- /order 只显示查询表单，不从 sessionStorage 自动恢复上次查询或订单列表；通过验证码后跳转 /order/results?ticket=短期查询凭证。
- 结果页单独承载摘要、状态筛选与分页，刷新按当前 URL 重新加载；缺失或过期凭证返回查询入口并提示重新查询。
- 列表凭证继续绑定服务端关键词与 IP；网址无需暴露邮箱或订单密码，筛选和页码随 URL 保存。
- 公共详情页返回当前查询结果链接；从顶部订单查询或结果页返回入口后，显示干净的查询表单。
- 验证：本地及 Docker 生产构建、隔离 HTTP 冒烟检查通过；浏览器确认结果页筛选与刷新、返回入口后刷新无列表、过期 ticket 返回入口提示。

## 2026-10-04 滑块验证码视觉与拖动体验优化

- 移除验证图片左下角的“安全验证”图标和文字标识。
- 验证图改为服务端绘制的浅蓝山景，返回背景 PNG 与透明拼图 PNG；缺口位置仍只保存在 Redis，继续绑定 IP、限时校验和一次性消费。
- 公共滑块组件改为独立圆角拖动条，增加加载、成功、失败反馈，统一 Pointer Events 处理鼠标与触屏，并支持方向键微调、回车验证。
- 根据实际容器宽度映射拖动距离，拼图随图片等比例缩放；关闭或刷新时终止旧请求、清理定时器，避免旧验证结果触发后续操作。
- 订单验证码弹窗收紧至 384px，简化为标题、说明、拼图和刷新操作；登录、注册共用的滑块同步更新。
- 验证：本地及 Docker 生产构建、3 项验证码相关隔离集成测试通过；桌面和 390px 手机视口、刷新图片检查通过。已更新本机商城，健康接口及新版验证码接口返回正常。

## 2026-10-03 移除购物车并统一订单查询规则

- 移除购物车、结算页和 Zustand；商品页单商品下单，强制自设订单查询密码，以 bcrypt 成本 12 存储哈希。
- 商品订单号为 AS + 20 位安全随机字符，充值保留 R 前缀；唯一冲突只重试整笔事务，不重复扣款、锁库存或通知。
- 公共查询改为邮箱/订单号 + 滑块验证，返回分页摘要；详情逐单验密。会员只可凭登录访问本人订单，充值始终要求本人登录。
- 查询凭证 10 分钟、绑定 IP/关键词，订单访问凭证 30 分钟、按订单授权；密码不再进入 URL、浏览器存储、邮件、卡密下载或后台响应。
- 详情、支付信息与轮询共用鉴权，状态轮询单独限流；移除旧查询接口和历史数据兼容。
- 新结构迁移要求订单表为空，测试订单须独立定向清理，禁止把清理逻辑放入日常迁移或启动流程。
- 已在事务中删除唯一测试订单 261002180146238309 及支付记录；关联卡密设为 INVALID、解除订单关联，商品 stock/salesCount 均为 0。数据库迁移完成，本机 Docker 商城已切换新版。
- 清理时新 Prisma Client 的 delete 默认返回新字段，与旧数据库不匹配；事务完整回滚。改为仅 select id 后完成清理，空表保护阻止了未清理时的迁移，确认无结构变更后标记回滚并重新部署迁移成功。
- 清理前数据库备份位于被忽略的 backups/before-order-query-20261003.dump。默认隔离测试库改为 ai_shop_order_query_test，避免旧测试夹具阻塞不兼容的结构迁移；CI 的显式测试地址仍可覆盖。
- 验证：11 项单元测试、15 项独立 PostgreSQL/Redis 集成测试、真实 HTTP 创建/查询/越权检查、本地及 Docker 生产构建通过；浏览器验证桌面/390px 手机列表、滑块、密码弹窗、错误密码和余额下单自动发货。
- npm audit 检出 7 项既有 high 级构建工具依赖告警（braces 经 Tailwind/ESLint 依赖链传播）；相关锁定版本本次未变更，未进行无关框架升级。


## 2026-10-03 修复上传商品图后保存失败

- 商品编辑表单将留空的原价提交为 null，但共享商品校验只允许数字或省略字段，导致保存报 Expected number, received null。
- 原价校验支持 null，保留留空时清除原价的语义；零原价在编辑表单中正确回显。必填售价仍须为合法数字。
- 添加商品图片更新及原价留空/清除的回归验证；无需重新上传已经成功上传的图片。

## 2026-10-03 恢复支付图标

- 恢复原有微信、支付宝 PNG 图标及商品购买、结算、充值和后台设置中的显示。
- 开源审查中的素材来源说明不作为擅自删除既有 UI 素材的理由；支付逻辑未调整。

## 2026-10-03 商品卡片高度统一

- 商品描述区域固定预留两行高度，无描述时也保留空间；超过两行省略，悬停可查看完整描述。
- 商品卡片填满所在网格，价格和库存行靠底部对齐，避免单行与双行描述造成卡片高度差异。

## 2026-10-03 商品标题与 Telegram 客服配置

- 商品卡片标题单行省略，鼠标悬停可查看完整名称；分类标签不被压缩。
- Telegram 客服改为后台系统设置，默认留空，支持用户名或官方链接；公开接口只返回客服链接，保存时清除设置缓存。
- 移除旧 NEXT_PUBLIC_TELEGRAM_URL 构建配置和本机默认地址；未设置时各处隐藏 Telegram 入口。

## 2026-10-02 注册页移除昵称

- 注册表单仅保留邮箱、密码和确认密码；不再提交或保存注册请求中的昵称。
- 现有用户的名称字段保留，未填写名称的账号继续使用邮箱展示。

## 2026-10-02 开源前安全整改

- 按用户决定保留现有查询规则：游客订单号 + 查询密码，会员订单仅凭订单号；历史停用密钥不重写 Git 历史。
- 支付通道未配置/禁用时拒绝回调；验证签名、金额、通道与订单状态，新增唯一 PaymentReceipt，重复回调不重复发货或入账。
- 余额扣款、充值、退款、库存预留/发货改为数据库串行化事务；过期/手动取消释放卡密；失败时完整回滚。
- USDT TRC20 报价持久化，以整数微单位精确匹配已确认转账；交易哈希跨订单唯一认领。历史无报价订单需人工核对，ERC20 自动收款关闭。
- 登录验证合并到 NextAuth Credentials authorize，加入实际认证入口限流；验证码返回服务端渲染图片并绑定 IP，一次性原子消费。账号改密/封禁撤销既有会话。
- 上传需管理员认证，限制频率/总量，并验证图片内容、重编码去除元数据。用户列表不再返回密码哈希，资金/用户/设置接口执行角色权限。
- 删除固定 JWT 密钥和管理员默认密码；真实配置改为被忽略的 .env，公开模板为 .env.example/.env.production.example。现有加密密钥不变。
- Next.js 升级至 15.5.27、Auth.js beta.32、Nodemailer 10；移除未用网络库，PostCSS 8.x 覆盖修复传递依赖。npm audit 全依赖 0 漏洞（本次检查时）。
- Next.js 15 使用异步 params/cookies；修复 checkout 客户端误引入服务端 Header，生产构建通过。
- 增加迁移基线及数据完整性迁移，旧 db push 数据库先检查基线。部署前已备份本机数据到忽略的 backups/，旧镜像保留 before-security-20261002 标签。
- 补充 MIT LICENSE、SECURITY/CONTRIBUTING、第三方通知和 CI。客服改为构建时配置，来源不明支付图标改为文字；文档改为源站 TLS + Cloudflare Full (strict)。
- 验证：6 项安全单元测试、8 项独立 PostgreSQL/Redis 集成测试、真实 HTTP 登录/权限/订单查询冒烟检查通过；本地及 Docker 生产构建通过。第三方收款/邮件没有配置真实凭据，未调用外部付款或通知。

## 2026-10-02 本机 Docker 部署

- 使用 `docker-compose.local.yml` 覆盖部署配置，商城绑定 `127.0.0.1:3010`，避免与已有 3000 端口服务冲突。
- 为本项目创建独立 PostgreSQL、Redis 和数据卷；本机 CLI 连接端口分别为 55439、16379。
- 随机数据库密码、认证密钥、加密密钥及初始管理员密码存入 Git 忽略的 `.env`，不写入日志。
- 本机 `.env.local` 链接到 `.env`，避免生产构建读取 `.env.production` 中的示例域名。
- `NEXT_PUBLIC_*` 通过 Compose build args 传入 Dockerfile，保证前端构建使用部署地址。
- Google Fonts 下载会出现 TLS 连接失败，导致本机 `npm run build` 失败；已保留 Inter 拉丁字体和 OFL 许可证，改用 `next/font/local`，消除构建时字体下载依赖。
- 种子脚本支持 `ADMIN_PASSWORD`，不输出密码、不覆盖已有管理员。初始化订单过期 10 分钟、自动删除 90 天；仅启用余额支付，第三方支付和邮件尚未配置。
- 已通过本机生产构建，并验证首页、商品详情、后台登录、后台权限和支付方式接口。

## 注意事项

### Docker 部署
- 添加新环境变量时，同步更新 `docker-compose.yml`
- **环境变量名必须与代码中的 `process.env.XXX` 完全一致**
  - 错误示例：代码用 `XUNHU_WECHAT_APPID`，docker-compose 写 `XUNHU_APPID`
  - 检查方法：`grep -r "process.env" src/` 查看代码中实际使用的变量名
- 修改 `docker-compose.yml` 后需要 `docker compose up -d` 重新加载
- 修改 `public/` 目录文件后，需要 `--build` 重新构建镜像
- 检查 `.dockerignore` 是否排除了需要的文件

### Next.js 缓存
- 公开的 GET API 需要加 `export const dynamic = "force-dynamic"` 禁用静态化
- 修改数据库数据后，检查是否需要清除 Redis 缓存
- 构建时用假数据库 URL，API 可能被静态化成错误结果

### 组件使用
- async 服务端组件不能在 "use client" 页面中直接使用
- 需要复用 Header 时，考虑拆分成客户端版本

### 工作流程
- 代码修改后先让用户本地确认，再提交
- 不要主动提交代码，等用户确认

### 日志规范
- **禁止使用 `console.error`**，统一使用 `src/lib/logger.ts` 中的日志工具
- 日志工具会根据 `NODE_ENV` 自动判断环境：
  - `development`：打印完整错误信息 + 堆栈（便于调试）
  - `production`：仅打印错误类型和消息（防止敏感信息泄露）

**使用方法：**
```typescript
import { logError, logWarn, logInfo, logDebug } from "@/lib/logger";

// 错误日志（生产环境隐藏堆栈）
logError("Create order", error);

// 警告日志（始终输出）
logWarn("Payment", "回调签名验证失败");

// 信息日志（仅开发环境）
logInfo("Cache", "商品缓存已更新");

// 调试日志（仅开发环境）
logDebug("Request", { body, headers });
```

### Redis 缓存隔离
- 多个项目共用同一个 Redis 时，使用不同的数据库编号隔离
- ai-shop 使用 `redis://localhost:6379/1`
- 清除 ai-shop 缓存: `docker exec crypto_quant_redis redis-cli -n 1 FLUSHDB`

---

## 2026-02-04 安全与性能优化

### commit - 高危安全问题修复

**安全修复：**

1. **中间件 JWT 验证** - 后台路由现在验证 token 有效性，无效/过期 token 自动拒绝
2. **会话时间缩短** - 管理员和用户会话从 7 天改为 24 小时
3. **CSRF 保护加强** - Cookie SameSite 从 `lax` 改为 `strict`（管理员+用户）
4. **订单查询频率限制** - 每 IP 每订单 20 次/5分钟，防暴力破解查询密码
5. **卡密数量限制** - 单次查询最多返回 100 条卡密，防止大订单性能问题
6. **未支付订单不返回卡密** - 仅 PAID/COMPLETED 状态订单返回解密卡密

**性能优化：**

7. **商品列表缓存** - 首页商品列表 Redis 缓存 5 分钟，更新时自动清除

**修改文件：**
- `src/middleware.ts` - JWT 验证逻辑
- `src/lib/auth.ts` - 会话时间 + 用户 Cookie 安全配置
- `src/app/api/admin/auth/login/route.ts` - 管理员 Cookie SameSite=strict
- `src/lib/services/product.service.ts` - 商品列表缓存
- `src/app/api/orders/route.ts` - 频率限制 + 卡密安全

**验证方法：**
- JWT 验证：修改浏览器 cookie 后刷新，应跳转登录页
- 会话时间：解析 JWT payload，有效期应为 24 小时
- CSRF：查看 Cookie 属性，SameSite 应为 Strict
- 频率限制：连续请求 21 次，第 21 次返回 429
- 卡密安全：查询 PENDING 订单，cardKeys 应为空数组

### commit - 中危安全问题修复

**安全修复：**

8. **安全响应头** - 添加 X-Frame-Options, X-Content-Type-Options, Referrer-Policy 等
9. **数据库索引优化** - Order 表添加复合索引 (status, createdAt), (userId, createdAt), expiredAt
10. **安全日志工具** - 新增 `src/lib/logger.ts`，生产环境隐藏错误堆栈
11. **IP 安全获取** - 新增 `src/lib/get-client-ip.ts`，优先使用 CF-Connecting-IP

**修改文件：**
- `next.config.mjs` - 安全响应头配置
- `prisma/schema.prisma` - 数据库索引
- `src/lib/logger.ts` - 安全日志工具（新增）
- `src/lib/get-client-ip.ts` - IP 安全获取（新增）
- 全部 API 路由文件 - console.error 替换为 logError

---

## 2026-02-02 提交记录

### commit - 下单锁定卡密功能

**新增功能：**
- 下单时锁定卡密，防止超卖
- 订单过期/取消时自动释放卡密
- 支付成功时将 LOCKED 状态转为 SOLD

**修改文件：**
- `src/lib/services/order.service.ts` - createOrder 使用事务锁定卡密，cancelExpiredOrders 释放卡密并清除缓存
- `src/lib/services/product.service.ts` - allocateCardKeys 支持从 LOCKED 转 SOLD
- `src/app/(shop)/pay/[orderNo]/page.tsx` - 倒计时改用时间戳计算，支持页面不可见时正确计时；检测订单取消状态
- `src/components/shop/contact-support.tsx` - Telegram 联系方式更新为 @example_support
- `src/components/shop/contact-buttons.tsx` - Telegram 联系方式更新
- `src/app/(shop)/page.tsx` - 页脚 Telegram 链接更新

**新增脚本：**
- `scripts/fix-locked-cardkeys.ts` - 修复历史遗留的 LOCKED 状态卡密

**遇到的问题：**
1. 订单取消后库存没释放 - 旧代码没有释放卡密逻辑，需要重启服务
2. 缓存导致库存显示不正确 - 下单/取消订单后需要清除商品缓存
3. 支付页面倒计时页面不可见时不走 - 改用基于过期时间戳实时计算

---

### commit 086d295 - 多项修复和优化
- 禁用支付方式 API 缓存
- 保存设置后清除 Redis 缓存
- 结账页面动态获取支付方式
- 支付页面添加 Header 导航

**遇到的问题：**
1. Dockerfile 没复制 public 目录，导致图标不显示
2. docker-compose.yml 缺少 Cloudinary 环境变量
3. Next.js 构建时静态化了支付方式 API
4. 保存设置后 Redis 缓存没清除，设置不生效
5. 服务端 Header 组件放到客户端页面导致报错

---

## 2026-02-02 移动端兼容性优化

### commit 3848656 - 移动端兼容性优化

**新增功能：**
- 添加 viewport 配置 (device-width, initialScale, maximumScale)
- 完善移动端抽屉式导航菜单 (汉堡按钮、侧边栏、导航链接)

**优化内容：**
- 支付页面响应式优化 (标题、二维码尺寸、USDT金额布局)
- 订单详情响应式网格布局 (grid-cols-1 sm:grid-cols-2)
- 购买按钮数量选择器响应式 (flex-wrap)
- 结账页面商品项响应式布局
- 修复个人中心订单状态标签被挤压问题 (添加 whitespace-nowrap, flex-shrink-0)

**修改文件：**
- `src/app/layout.tsx` - 添加 viewport 配置
- `src/components/shop/header.tsx` - 集成 HeaderClient 移动端菜单
- `src/components/shop/header-client.tsx` - 实现完整的移动端抽屉式导航
- `src/app/(shop)/pay/[orderNo]/page.tsx` - 响应式布局优化
- `src/components/shop/order-detail.tsx` - 网格布局响应式
- `src/components/shop/buy-now-button.tsx` - 数量选择器响应式
- `src/app/(shop)/checkout/page.tsx` - 商品项响应式
- `src/app/(user)/dashboard/page.tsx` - 订单状态标签不换行

---

### commit 04d0a26 - 修复退出登录无反应问题

**Bug 修复：**
- PC端和移动端退出登录按钮点击无反应

**原因：**
- `signOut()` 没有传递 `callbackUrl` 参数，导致退出后页面没有跳转刷新

**修复：**
- 改为 `signOut({ callbackUrl: "/" })`

---

### commit 974361b - 重置密码页面UI优化

**优化内容：**
- 统一使用与登录页相同的顶部导航布局 (左上角 AI Shop logo)
- 移除自定义"生成"密码按钮，改用浏览器原生密码生成
- 添加 `autoComplete="new-password"` 触发 Chrome 密码建议

**修改文件：**
- `src/app/(auth)/reset-password/page.tsx` - 页面布局重构
- `src/components/ui/password-input.tsx` - 添加可选的 showGenerator 属性

---

### Docker 部署注意事项（新增）

**需要 `--no-cache` 重新构建的情况：**
1. 修改了前端页面组件（CSS、布局、样式）
2. 修改了静态文件（public 目录）
3. Dockerfile 中间层命令没变但文件内容变了
4. 依赖包更新（package.json 修改）
5. NEXT_PUBLIC_* 环境变量修改（构建时嵌入）

**命令：**
```bash
# 强制无缓存重新构建
docker-compose build --no-cache
docker-compose up -d

# 或一条命令
docker-compose up -d --build --force-recreate
```

**不需要清缓存的情况：**
- 只改了服务端 API 逻辑（/api/* 路由）
- 只改了数据库操作代码
- 只改了运行时读取的环境变量（非 NEXT_PUBLIC_*）

---

## 2026-02-03 公告管理系统

### commit 1b42f01 - 新增后台公告管理功能

**新增功能：**
- 后台侧边栏添加"📢 公告管理"入口
- 公告列表页面（查看、启用/停用、删除）
- 新增/编辑公告弹窗（标题、内容、类型、排序、置顶）
- 公告管理 API（CRUD）

**新增文件：**
- `src/app/admin/announcements/page.tsx` - 公告管理页面
- `src/app/admin/announcements/layout.tsx` - 布局文件
- `src/app/api/admin/announcements/route.ts` - 列表/创建 API
- `src/app/api/admin/announcements/[id]/route.ts` - 更新/删除 API

---

### commit a57539e - 修复公告管理API认证函数错误

**Bug 修复：**
- API 使用了不存在的 `verifyAdmin` 函数导致报错

**修复：**
- 改为使用 `getAdminSession()`

---

### commit 2137664 - 公告支持富文本格式嵌套组合

**新增功能：**
- 支持链接：`[文字](URL)`
- 支持加粗：`**文字**`
- 支持高亮：`==文字==`
- 支持颜色：`{红色}文字{/红色}`、`{绿色}`、`{蓝色}`
- 支持任意嵌套组合：`**{红色}红色加粗{/红色}**`

**样式调整：**
- 公告标题字体：`text-lg` (18px)
- 公告内容字体：`text-base` (16px)
- 后台编辑框高度：`h-40`

**使用示例：**
```
**{红色}重要通知{/红色}**：本站已上线新功能！
==限时优惠==活动进行中，{绿色}全场9折{/绿色}！
详情请[点击这里](https://example.com)
```

---

## 2026-02-03 安全加固

### commit dda7778 - 后台安全加固

**安全修复：**
- 所有 admin API 添加 `getAdminSession()` 权限验证
- 生产环境移除敏感日志（支付请求/响应/回调参数）
- 添加 `middleware.ts` 统一路由保护，未登录访问后台自动跳转登录页

**修改文件：**
- `src/middleware.ts` - 新增，后台路由保护中间件
- `src/app/api/admin/*/route.ts` - 12个文件添加权限验证
- `src/lib/payment/index.ts` - 敏感日志仅开发环境打印
- `src/app/api/payment/callback/*/route.ts` - 回调参数仅开发环境打印

---

### commit 4483def - 修复多项安全漏洞

**1. Redis 限流竞态条件修复**
- 使用 Lua 脚本保证 `incr + expire` 原子执行
- 防止程序崩溃导致 key 永不过期

**2. 管理员登录添加失败限流**
- 5次失败后锁定30分钟
- 显示剩余尝试次数
- 清除锁定命令：`redis-cli del admin_login_fail:用户名`

**3. 公告富文本 XSS 防护**
- 添加 `isSafeUrl()` 验证 URL 协议
- 仅允许 http/https，拦截 javascript: 等危险协议

**4. 下单限流配置收紧**
- EMAIL 从每小时50次降至10次

**5. 密钥派生安全增强**
- 改用 PBKDF2（10万次迭代 + 固定盐值）替代简单 SHA256
- ⚠️ **重要**：此修改导致旧卡密无法解密，需重新导入

**6. 随机数生成器修复**
- `generatePassword` / `generateOrderNo` 改用 `crypto.randomInt()`
- 订单号随机部分从4位增至6位，降低碰撞风险

**修改文件：**
- `src/lib/services/anti-fraud.service.ts` - Lua脚本限流、配置收紧
- `src/app/api/admin/auth/login/route.ts` - 管理员登录限流
- `src/components/shop/announcement.tsx` - XSS防护
- `src/lib/encryption.ts` - PBKDF2密钥派生、安全随机数

---

### commit ecdf359 - 公告管理页面布局修复

**修复：**
- 公告管理页面添加 AdminSidebar 组件
- 统一布局结构与其他管理模块一致

---

### commit cd0c449 - 已登录管理员访问登录页自动跳转

**优化：**
- 登录页 layout 添加 `getAdminSession` 检测
- 已登录状态自动重定向到 `/admin/dashboard`

---

## 2026-02-03 密码策略和表单验证优化

### commit - 密码最小长度改为8位 + 前端表单验证

**安全增强：**
- 密码最小长度从 6 位改为 8 位（所有页面）
- 前端添加邮箱格式验证（登录、注册、忘记密码）
- 前端添加密码长度验证，减少无效 API 请求

**表单优化：**
- 注册/重置密码页面密码框 `autoComplete="off"` 禁用浏览器自动填充
- 管理员设置页面当前密码 `autoComplete="one-time-code"` 阻止填充已保存密码
- 管理员设置页面新密码 `autoComplete="new-password"`

**修改文件：**
- `src/app/(auth)/login/page.tsx` - 邮箱格式 + 密码长度验证
- `src/app/(auth)/register/page.tsx` - 邮箱格式 + 密码长度验证 + autoComplete
- `src/app/(auth)/forgot-password/page.tsx` - 邮箱格式验证
- `src/app/(auth)/reset-password/page.tsx` - 密码长度验证 + autoComplete
- `src/app/admin/login/page.tsx` - 密码长度验证
- `src/app/admin/settings/page.tsx` - 密码长度验证 + autoComplete
- `src/lib/validations/index.ts` - 密码 schema 改为 min(8)
- `src/app/api/auth/reset-password/route.ts` - 后端验证改为 8 位
- `src/app/api/admin/password/route.ts` - 后端验证改为 8 位

---

### 安全注意事项

**密码策略变更：**
- 2026-02-03 密码最小长度从 6 位改为 8 位
- 影响范围：注册、登录、重置密码、管理员登录、管理员修改密码
- 旧账号不受影响，仅新设置的密码需要满足 8 位要求

**密钥派生算法变更影响：**
- 2026-02-03 之前导入的卡密使用旧算法加密
- 新算法无法解密旧卡密，会报错 `unable to authenticate data`
- 解决方案：清空旧卡密，重新导入

```bash
# 清空卡密表
docker exec -it <postgres容器> psql -U aishop -d ai_shop -c "DELETE FROM \"CardKey\";"
```

**管理员登录被锁定解决：**
```bash
# 清除锁定
docker exec <redis容器> redis-cli -n 1 del admin_login_fail:admin
```

---

## 2026-02-04 表单自动填充优化 & 重置密码过期验证

### commit - 禁用注册/重置密码表单自动填充 + token 过期验证

**优化内容：**
- 注册页面邮箱禁用自动填充 (`autoComplete="off"`)
- 注册/重置密码页面密码框改用 `autoComplete="new-password"`
- 重置密码链接有效期从 30 分钟改为 10 分钟
- 重置密码页面打开时立即验证 token 有效性

**新增文件：**
- `src/app/api/auth/verify-reset-token/route.ts` - 验证重置密码 token 是否有效

**修改文件：**
- `src/app/(auth)/register/page.tsx` - 邮箱 autoComplete="off"，密码 autoComplete="new-password"
- `src/app/(auth)/reset-password/page.tsx` - 页面加载时验证 token，过期直接显示错误
- `src/app/api/auth/forgot-password/route.ts` - 过期时间改为 10 分钟，使用 setex 确保过期生效

**技术细节：**
- Redis 存储 token 使用 `setex` 替代 `set + EX` 参数，确保过期时间正确设置
- 前端使用 useEffect 在页面加载时调用验证 API
- 验证中显示加载状态，过期/无效显示错误页面并引导重新获取链接
