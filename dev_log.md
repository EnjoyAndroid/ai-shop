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

---

## 2026-02-02 提交记录

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
