# 开发日志

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

### Redis 缓存隔离
- 多个项目共用同一个 Redis 时，使用不同的数据库编号隔离
- ai-shop 使用 `redis://localhost:6379/1`
- 清除 ai-shop 缓存: `docker exec crypto_quant_redis redis-cli -n 1 FLUSHDB`

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
