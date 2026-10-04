import { createHash, randomBytes } from "crypto";
import redis from "./redis";

export const ORDER_ACCESS_SECONDS = 30 * 60;
export const ORDER_QUERY_SECONDS = 10 * 60;
const tokenPattern = /^[a-f0-9]{64}$/;
const tokenKey = (scope: string, token: string) => `order:${scope}:${createHash("sha256").update(token).digest("hex")}`;

async function issueToken(scope: string, value: object, ttl: number): Promise<string> {
  const token = randomBytes(32).toString("hex");
  await redis.setex(tokenKey(scope, token), ttl, JSON.stringify(value));
  return token;
}

export function issueOrderAccess(orderId: string): Promise<string> {
  return issueToken("access", { orderId }, ORDER_ACCESS_SECONDS);
}

export function issueOrderQuery(keyword: string, ip: string): Promise<string> {
  return issueToken("query", { keyword, ip }, ORDER_QUERY_SECONDS);
}

export async function readOrderQuery(token: string, ip: string): Promise<string | null> {
  if (!tokenPattern.test(token)) return null;
  const raw = await redis.get(tokenKey("query", token));
  if (!raw) return null;
  const data = JSON.parse(raw) as { keyword: string; ip: string };
  return data.ip === ip ? data.keyword : null;
}

export async function canAccessOrder(
  order: { id: string; orderNo: string; userId: string | null },
  token: string,
  userId?: string,
): Promise<boolean> {
  if (userId && order.userId === userId) return true;
  // Recharge access is always account-bound, even if a product token is supplied.
  if (order.orderNo.startsWith("R") || !tokenPattern.test(token)) return false;
  const raw = await redis.get(tokenKey("access", token));
  return Boolean(raw && (JSON.parse(raw) as { orderId: string }).orderId === order.id);
}
