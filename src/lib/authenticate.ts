import bcrypt from "bcryptjs";
import prisma from "./db";
import redis, { CACHE_KEYS } from "./redis";
import { consumeCaptchaToken } from "./captcha";
import { getClientIp } from "./get-client-ip";
import { rateLimit, rateLimitKey } from "./rate-limit";

export async function authenticateCredentials(credentials: Partial<Record<string, unknown>>, request: Request) {
  const account = typeof credentials.account === "string" ? credentials.account.trim().toLowerCase() : "";
  const password = typeof credentials.password === "string" ? credentials.password : "";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(account) || account.length > 254 || !password || password.length > 128) return null;
  const ip = getClientIp(request);
  if (!await rateLimit("login-ip", ip, 30, 900) || !await rateLimit("login-account", account, 10, 900)) return null;
  const failKey = CACHE_KEYS.LOGIN_FAIL_COUNT(account);
  const failures = Number(await redis.get(failKey) || 0);
  if (failures >= 3 && !await consumeCaptchaToken(String(credentials.captchaToken || ""), ip)) return null;
  const user = await prisma.user.findUnique({ where: { email: account } });
  if (!user?.password || user.status !== "ACTIVE" || !await bcrypt.compare(password, user.password)) {
    await redis.eval(`local n = redis.call('INCR', KEYS[1]); if n == 1 then redis.call('EXPIRE', KEYS[1], 900) end; return n`, 1, failKey);
    return null;
  }
  await redis.del(failKey, rateLimitKey("login-account", account));
  return { id: user.id, email: user.email, name: user.name, image: user.avatar, sessionVersion: user.sessionVersion };
}
