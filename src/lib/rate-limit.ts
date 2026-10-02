import { createHash } from "crypto";
import redis from "./redis";

export function rateLimitKey(scope: string, identifier: string): string {
  return `limit:${scope}:${createHash("sha256").update(identifier).digest("hex")}`;
}

// 先计数再执行昂贵操作；Redis 故障时由调用方拒绝请求。
export async function rateLimit(scope: string, identifier: string, max: number, seconds: number): Promise<boolean> {
  const count = await redis.eval(
    `local n = redis.call('INCR', KEYS[1])
     if n == 1 then redis.call('EXPIRE', KEYS[1], ARGV[1]) end
     return n`,
    1, rateLimitKey(scope, identifier), seconds
  );
  return Number(count) <= max;
}
