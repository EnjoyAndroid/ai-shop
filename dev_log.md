# 开发日志

## 注意事项

### Docker 部署
- 添加新环境变量时，同步更新 `docker-compose.yml`
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
- `src/components/shop/contact-support.tsx` - Telegram 联系方式更新为 @ai_shop_5
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
