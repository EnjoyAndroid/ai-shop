const readMethods = new Set(["GET", "HEAD", "OPTIONS"]);
const signedCallbacks = new Set(["/api/payment/callback/alipay", "/api/payment/callback/wechat"]);

// Browser cookies are same-site, not same-origin: sibling subdomains can still
// send them. Compare with configured origin, never untrusted Host/proxy headers.
export function browserWriteAllowed(request: { method: string; headers: Headers }, pathname: string, siteUrl: string | undefined): boolean {
  if (!pathname.startsWith("/api/") || readMethods.has(request.method) || signedCallbacks.has(pathname)) return true;
  try {
    if (!siteUrl) return false;
    const canonical = new URL(siteUrl);
    if (!["https:", "http:"].includes(canonical.protocol) || canonical.username || canonical.password) return false;
    if (request.headers.get("origin") !== canonical.origin) return false;
    const fetchSite = request.headers.get("sec-fetch-site");
    return !fetchSite || fetchSite === "same-origin";
  } catch { return false; }
}

export function contentSecurityPolicy(nonce: string, development: boolean): string {
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${development ? " 'unsafe-eval'" : ""}`,
    "script-src-attr 'none'",
    // React uses inline styles; script execution still requires the nonce.
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https:",
    "font-src 'self'",
    `connect-src 'self'${development ? " ws: wss:" : ""}`,
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "frame-src 'none'",
  ].join("; ");
}
