import Redis from "ioredis";

const globalForRedis = globalThis as unknown as {
  redis: Redis | undefined;
};

function createRedisClient(): Redis {
  const redisUrl = process.env.REDIS_URL || "redis://localhost:6379";

  return new Redis(redisUrl, {
    maxRetriesPerRequest: 3,
    lazyConnect: true,
    retryStrategy: (times) => {
      if (times > 3) return null;
      return Math.min(times * 200, 1000);
    },
  });
}

export const redis = globalForRedis.redis ?? createRedisClient();

if (process.env.NODE_ENV !== "production") globalForRedis.redis = redis;

// 缓存键前缀
export const CACHE_KEYS = {
  // 商品缓存
  PRODUCT: (id: string) => `product:${id}`,
  PRODUCTS_LIST: "products:list",
  CATEGORIES: "categories:list",

  // 限流
  RATE_LIMIT_IP: (ip: string) => `ratelimit:ip:${ip}`,
  RATE_LIMIT_EMAIL: (email: string) => `ratelimit:email:${email}`,
  RATE_LIMIT_FINGERPRINT: (fp: string) => `ratelimit:fp:${fp}`,

  // 订单锁
  ORDER_LOCK: (orderId: string) => `order:lock:${orderId}`,

  // 卡密锁
  CARDKEY_LOCK: (productId: string) => `cardkey:lock:${productId}`,
};

export default redis;
