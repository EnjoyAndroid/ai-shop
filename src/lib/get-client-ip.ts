import { NextRequest } from "next/server";

/**
 * 安全获取客户端真实 IP
 *
 * 信任优先级（根据部署架构）：
 * 1. CF-Connecting-IP - Cloudflare 提供的真实客户端 IP（最可信）
 * 2. X-Real-IP - Nginx 设置的客户端 IP（可信，由 Nginx 从 $remote_addr 获取）
 * 3. X-Forwarded-For - 代理链中的第一个 IP（可能被伪造，仅作为降级）
 *
 * 注意：X-Forwarded-For 可被客户端伪造，不应直接信任
 */
export function getClientIp(request: NextRequest): string {
  // 1. Cloudflare 提供的真实 IP（最可信）
  const cfIp = request.headers.get("cf-connecting-ip");
  if (cfIp && isValidIp(cfIp)) {
    return cfIp;
  }

  // 2. Nginx 设置的 X-Real-IP（由 Nginx 从 $remote_addr 获取，可信）
  const realIp = request.headers.get("x-real-ip");
  if (realIp && isValidIp(realIp)) {
    return realIp;
  }

  // 3. X-Forwarded-For 的第一个 IP（降级方案，可能被伪造）
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) {
    const firstIp = forwardedFor.split(",")[0]?.trim();
    if (firstIp && isValidIp(firstIp)) {
      return firstIp;
    }
  }

  // 4. 无法获取 IP
  return "unknown";
}

/**
 * 验证 IP 地址格式
 */
function isValidIp(ip: string): boolean {
  // IPv4
  const ipv4Regex = /^(\d{1,3}\.){3}\d{1,3}$/;
  if (ipv4Regex.test(ip)) {
    const parts = ip.split(".").map(Number);
    return parts.every((part) => part >= 0 && part <= 255);
  }

  // IPv6（简化验证）
  const ipv6Regex = /^([0-9a-fA-F]{0,4}:){2,7}[0-9a-fA-F]{0,4}$/;
  if (ipv6Regex.test(ip)) {
    return true;
  }

  return false;
}
