import crypto from "crypto";
import { redis, CACHE_KEYS } from "./redis";

// 验证码配置
const CAPTCHA_CONFIG = {
  // 滑块位置范围
  MIN_X: 50,
  MAX_X: 250,
  // 允许的误差范围 (±5px)
  TOLERANCE: 5,
  // 验证码过期时间 (5分钟)
  EXPIRE_SECONDS: 300,
};

// 扩展 CACHE_KEYS
export const CAPTCHA_KEYS = {
  TOKEN: (token: string) => `captcha:${token}`,
};

// 生成随机滑块位置
export function generateSliderPosition(): number {
  const range = CAPTCHA_CONFIG.MAX_X - CAPTCHA_CONFIG.MIN_X;
  return Math.floor(Math.random() * range) + CAPTCHA_CONFIG.MIN_X;
}

// 生成验证码 token
export function generateCaptchaToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

// 存储验证码信息到 Redis
export async function storeCaptcha(
  token: string,
  position: number
): Promise<void> {
  const key = CAPTCHA_KEYS.TOKEN(token);
  const data = JSON.stringify({
    position,
    createdAt: Date.now(),
  });
  await redis.setex(key, CAPTCHA_CONFIG.EXPIRE_SECONDS, data);
}

// 验证滑块位置
export async function verifyCaptcha(
  token: string,
  userPosition: number
): Promise<{ success: boolean; message: string }> {
  if (!token) {
    return { success: false, message: "验证码 token 缺失" };
  }

  const key = CAPTCHA_KEYS.TOKEN(token);
  const data = await redis.get(key);

  if (!data) {
    return { success: false, message: "验证码已过期或无效" };
  }

  try {
    const parsed = JSON.parse(data);
    const diff = Math.abs(parsed.position - userPosition);

    if (diff <= CAPTCHA_CONFIG.TOLERANCE) {
      // 验证成功，标记为已验证（不删除，等注册时删除）
      await redis.setex(
        key,
        CAPTCHA_CONFIG.EXPIRE_SECONDS,
        JSON.stringify({ ...parsed, verified: true })
      );
      return { success: true, message: "验证成功" };
    } else {
      return { success: false, message: "验证失败，请重试" };
    }
  } catch {
    return { success: false, message: "验证码数据错误" };
  }
}

// 检查验证码 token 是否已验证（用于注册时校验，校验后删除）
export async function consumeCaptchaToken(token: string): Promise<boolean> {
  if (!token) return false;

  const key = CAPTCHA_KEYS.TOKEN(token);
  const data = await redis.get(key);

  if (!data) return false;

  try {
    const parsed = JSON.parse(data);
    if (parsed.verified) {
      // 已验证，删除 token（一次性使用）
      await redis.del(key);
      return true;
    }
    return false;
  } catch {
    return false;
  }
}
