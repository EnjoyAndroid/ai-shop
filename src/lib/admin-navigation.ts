/** Only admin page paths may be restored after authentication. No URLs/query/fragment. */
export function adminDestination(value: unknown): string {
  return typeof value === "string" && /^\/admin(?:\/[a-zA-Z0-9_-]+)+$/.test(value)
    && !value.startsWith("/admin/login") ? value : "/admin/dashboard";
}

export function adminLoginUrl(pathname: string, configuredSiteUrl: string | undefined, requestUrl: string): URL {
  const base = new URL(configuredSiteUrl || requestUrl);
  if (!["http:", "https:"].includes(base.protocol) || base.username || base.password) throw new Error("Invalid site origin");
  const url = new URL("/admin/login", base.origin);
  url.searchParams.set("next", adminDestination(pathname));
  return url;
}
