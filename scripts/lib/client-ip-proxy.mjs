import { isIP } from 'node:net';

/** Generate a reviewable config; callers must verify the immediate tunnel peer. */
export function clientIpProxyCandidate(source, peer) {
  if (!isIP(peer)) throw new Error('Expected one verified immediate proxy IP, not a CIDR or hostname');
  if (/\b(?:set_real_ip_from|real_ip_header|real_ip_recursive)\s/.test(source)) throw new Error('Existing real-IP policy requires review; refusing to merge');
  const match = source.match(/^[ \t]*listen[ \t]+80;/gm);
  if (match?.length !== 1) throw new Error('Expected exactly one HTTP ingress server');
  if (!source.includes('proxy_set_header X-Real-IP $remote_addr;')) throw new Error('Proxy must overwrite X-Real-IP');
  const prefix = `    # Only the verified local tunnel ingress may provide Cloudflare client identity.\n    set_real_ip_from ${peer}${isIP(peer) === 4 ? '/32' : '/128'};\n    real_ip_header CF-Connecting-IP;\n    real_ip_recursive off;\n`;
  return source.replace(match[0], `${match[0]}\n${prefix}`)
    .replaceAll('proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;', 'proxy_set_header X-Forwarded-For $remote_addr;');
}
