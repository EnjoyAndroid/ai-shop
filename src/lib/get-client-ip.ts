/** 仅在由可信反向代理覆盖 X-Real-IP、且应用端口未公开时开启 TRUST_PROXY。 */
export function getClientIp(request: { headers: Headers }): string {
  if (process.env.TRUST_PROXY !== "true") return "direct";
  const ip = request.headers.get("x-real-ip")?.trim();
  // 不信任用户传入的 CF-Connecting-IP 或 X-Forwarded-For。
  if (ip && ip.length <= 45 && /^[\da-fA-F:.]+$/.test(ip)) return ip;
  return "unknown";
}
