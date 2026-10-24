# Cloudflare Tunnel 客户端 IP

当前链路为 Cloudflare → 宿主机 cloudflared → 127.0.0.1:3010 → Nginx → app:3000。应用无宿主机公开端口；3013是独立本地开发入口，不经过该隧道。

## 信任边界

仅 Nginx 可以向应用提供 `X-Real-IP`。Cloudflare 提供的 `CF-Connecting-IP` 只在连接来自已核实的隧道入口时被接受；不信任访客自己填写的 `X-Real-IP`、`X-Forwarded-For`。Nginx 将校验后的地址覆盖进这两个头，再清空传给应用的 `CF-Connecting-IP`。

Docker Desktop 会把本机到容器的连接映射到 Docker 网关。已观察到的入口为 `172.26.0.1`，只信任它的 /32；不能照抄为所有机器的默认值，也不能扩展为整个内网或 0.0.0.0/0。本机进程、Docker 管理权限和 cloudflared 属于可信边界；这种方式不能区分同一宿主机上的恶意本地进程。若宿主机不可信，应改为隔离网络中的专用 tunnel 容器，不能扩大白名单。

源站必须继续只监听宿主机回环地址，应用端口不得公开；Docker 网络变化时先重新核对即时连接来源。未匹配白名单、缺失或非法 IP 时保留连接来源，客服将内网地址显示为未确认。Cloudflare Workers、Pseudo IPv4 或其他修改访客地址的规则需在公网验收时一并核对，不能只凭隔离测试断言边缘端到端通过。

## 准备与验收

只读核实运行隧道的 ingress、生产 Nginx 配置挂载、端口及直接对端后执行：

```bash
node scripts/prepare-client-ip-proxy.mjs 172.26.0.1
node scripts/test-client-ip-proxy.mjs
```

准备脚本生成 `.deploy/client-ip/nginx.candidate.conf` 和源/候选哈希，不修改 `.deploy/nginx.production.conf`。已有候选不自动覆盖。测试使用本机生产同版本 Nginx 镜像和独立内部 Docker 网络，不发布宿主机端口；覆盖可信 IPv4/IPv6、伪造转发头、非白名单来源及缺失/非法地址，最终删除临时容器和网络。报告在 `.deploy/client-ip/verification.json`。

应用仍使用既有 `TRUST_PROXY=true` 及 IP 校验，不需要扩大代码中的请求头信任。游客 Cookie 身份不变。历史未知 IP 无法补回，修改只影响此后的请求。

## 公网发布（须明确授权）

1. 发布前复验源配置哈希、来源白名单与运行网络一致。生成并通过 `release:prepare` 的完整应用候选；旧应用未包含本轮客服 IP 存库功能，单改代理不足以完成统计。
2. 按既有发布流程备份数据库、配置并部署指定候选。不要重建数据库、Redis、隧道或生产网络。
3. 另存当前 Nginx 快照及文件权限。配置以单文件 bind mount 挂载，应用候选时保留挂载文件 inode（原位写入），不能简单 rename 后假定容器会看到新文件。
4. 先执行 `docker exec ai-shop-nginx nginx -t`，失败时原位还原备份，不能 reload；成功后只执行 Nginx reload，不重建容器。
5. 从公网用独立测试会话发送一个零模型 FAQ，确认新记录含可信访客 IP；正常访问与携带伪造 X-Real-IP/X-Forwarded-For/CF-Connecting-IP 的访问不能把注入值记录为访客。只比对结果，不公开真实 IP 或会话 Cookie。
6. 检查本机及公网健康、既有管理员登录和 IP 限流；核实生产依赖容器不变。如果边缘无法可靠提供访客 IP，回退代理配置，继续显示未确认。

代理回退只恢复 Nginx 配置并验证/reload；应用回退遵循现有固定镜像流程。不能恢复旧数据库覆盖新订单。
