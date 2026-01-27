import redis, { CACHE_KEYS } from "@/lib/redis";

interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;
}

/**
 * 防刷单服务
 * 基于 IP、邮箱、设备指纹进行限流
 */
export class AntiFraudService {
  // 限流配置
  private static readonly LIMITS = {
    // IP 限制：每分钟最多 10 次请求
    IP: { max: 10, windowSeconds: 60 },
    // 邮箱限制：每小时最多 5 次下单
    EMAIL: { max: 5, windowSeconds: 3600 },
    // 设备指纹限制：每小时最多 10 次下单
    FINGERPRINT: { max: 10, windowSeconds: 3600 },
  };

  /**
   * 检查 IP 限流
   */
  static async checkIPLimit(ip: string): Promise<RateLimitResult> {
    const key = CACHE_KEYS.RATE_LIMIT_IP(ip);
    return this.checkLimit(key, this.LIMITS.IP.max, this.LIMITS.IP.windowSeconds);
  }

  /**
   * 检查邮箱限流
   */
  static async checkEmailLimit(email: string): Promise<RateLimitResult> {
    const key = CACHE_KEYS.RATE_LIMIT_EMAIL(email);
    return this.checkLimit(key, this.LIMITS.EMAIL.max, this.LIMITS.EMAIL.windowSeconds);
  }

  /**
   * 检查设备指纹限流
   */
  static async checkFingerprintLimit(fingerprint: string): Promise<RateLimitResult> {
    const key = CACHE_KEYS.RATE_LIMIT_FINGERPRINT(fingerprint);
    return this.checkLimit(key, this.LIMITS.FINGERPRINT.max, this.LIMITS.FINGERPRINT.windowSeconds);
  }

  /**
   * 综合检查（下单时使用）
   */
  static async checkOrderLimit(params: {
    ip?: string;
    email?: string;
    fingerprint?: string;
  }): Promise<{ allowed: boolean; reason?: string }> {
    const { ip, email, fingerprint } = params;

    // 检查 IP
    if (ip) {
      const ipResult = await this.checkIPLimit(ip);
      if (!ipResult.allowed) {
        return { allowed: false, reason: "请求过于频繁，请稍后再试" };
      }
    }

    // 检查邮箱
    if (email) {
      const emailResult = await this.checkEmailLimit(email);
      if (!emailResult.allowed) {
        return { allowed: false, reason: "该邮箱下单次数过多，请稍后再试" };
      }
    }

    // 检查设备指纹
    if (fingerprint) {
      const fpResult = await this.checkFingerprintLimit(fingerprint);
      if (!fpResult.allowed) {
        return { allowed: false, reason: "该设备下单次数过多，请稍后再试" };
      }
    }

    return { allowed: true };
  }

  /**
   * 通用限流检查
   */
  private static async checkLimit(
    key: string,
    max: number,
    windowSeconds: number
  ): Promise<RateLimitResult> {
    const current = await redis.incr(key);

    if (current === 1) {
      // 首次请求，设置过期时间
      await redis.expire(key, windowSeconds);
    }

    const ttl = await redis.ttl(key);
    const resetAt = Date.now() + ttl * 1000;

    return {
      allowed: current <= max,
      remaining: Math.max(0, max - current),
      resetAt,
    };
  }

  /**
   * 检查是否为可疑订单
   */
  static async checkSuspiciousOrder(params: {
    ip?: string;
    email?: string;
    amount: number;
  }): Promise<{ suspicious: boolean; reasons: string[] }> {
    const reasons: string[] = [];

    // 检查大额订单
    if (params.amount > 100000) {
      // 超过 1000 元
      reasons.push("大额订单");
    }

    // 检查邮箱格式
    if (params.email) {
      // 检查临时邮箱域名
      const tempDomains = [
        "tempmail.com",
        "guerrillamail.com",
        "10minutemail.com",
        "mailinator.com",
      ];
      const domain = params.email.split("@")[1]?.toLowerCase();
      if (domain && tempDomains.includes(domain)) {
        reasons.push("使用临时邮箱");
      }
    }

    return {
      suspicious: reasons.length > 0,
      reasons,
    };
  }
}

export default AntiFraudService;
