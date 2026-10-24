import { isIP } from 'node:net';

/** Enable only behind a trusted proxy that overwrites X-Real-IP. */
export function getClientIp(request: { headers: Headers }): string {
  if (process.env.TRUST_PROXY !== 'true') return 'direct';
  const value = request.headers.get('x-real-ip')?.trim();
  return value && isIP(value) ? value : 'unknown';
}
export interface ClientIpInfo { value: string; trusted: boolean; }
export function getClientIpInfo(request: { headers: Headers }): ClientIpInfo {
  let ip = getClientIp(request).toLowerCase();
  if (isIP(ip) === 6) ip = new URL(`http://[${ip}]`).hostname.slice(1,-1);
  const mapped = /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(ip);
  if (mapped) { const bits = parseInt(mapped[1],16)*65536+parseInt(mapped[2],16); ip = [24,16,8,0].map(n => (bits >>> n)&255).join('.'); }
  // A tunnel/loopback/private peer is not a verified visitor. Share the unknown
  // bucket until the ingress establishes the real client address.
  const privateV4 = /^(0|10|127|169\.254|192\.168)\./.test(ip) || /^172\.(1[6-9]|2\d|3[01])\./.test(ip)
    || /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./.test(ip);
  const privateV6 = ip === '::1' || ip === '::' || /^(fc|fd|fe[89ab])/i.test(ip);
  if (!isIP(ip) || privateV4 || privateV6) return { value: 'unknown', trusted: false };
  if (isIP(ip) === 6) ip = new URL(`http://[${ip}]`).hostname.slice(1,-1);
  return { value: ip, trusted: true };
}
