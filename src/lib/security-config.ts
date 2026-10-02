// 不在模块加载时读取密钥：构建过程不需要生产凭据。
export function requireSecret(name: "NEXTAUTH_SECRET" | "ENCRYPTION_KEY" | "CRON_SECRET"): string {
  const value = process.env[name];
  if (!value || value.length < 32 || /your[-_ ]|change[-_ ]?me|placeholder|replace_with|example|admin-secret/i.test(value)) {
    throw new Error(`${name} 必须配置为至少 32 字符的独立随机密钥`);
  }
  return value;
}

export function getAdminSecret(): Uint8Array {
  return new TextEncoder().encode(requireSecret("NEXTAUTH_SECRET"));
}

export function validateRuntimeConfig(): void {
  requireSecret("NEXTAUTH_SECRET");
  requireSecret("ENCRYPTION_KEY");
  for (const name of ["DATABASE_URL", "REDIS_URL", "NEXTAUTH_URL", "NEXT_PUBLIC_SITE_URL"]) {
    if (!process.env[name]) throw new Error(`${name} 未配置`);
    new URL(process.env[name]!);
  }
}
