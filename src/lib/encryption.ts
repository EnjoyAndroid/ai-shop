import crypto from "crypto";
import { requireSecret } from "./security-config";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 16;
const TAG_LENGTH = 16;
const SALT = "ai-shop-encryption-salt-v1";

function getEncryptionKey(): Buffer {
  const key = requireSecret("ENCRYPTION_KEY");
  // 使用 PBKDF2 进行密钥派生（更安全）
  return crypto.pbkdf2Sync(key, SALT, 100000, 32, "sha256");
}

export interface EncryptedData {
  content: string;
  iv: string;
  tag: string;
}

/**
 * 加密卡密内容
 */
export function encrypt(plaintext: string): EncryptedData {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(IV_LENGTH);

  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  let encrypted = cipher.update(plaintext, "utf8", "base64");
  encrypted += cipher.final("base64");

  const tag = cipher.getAuthTag();

  return {
    content: encrypted,
    iv: iv.toString("base64"),
    tag: tag.toString("base64"),
  };
}

/**
 * 解密卡密内容
 */
export function decrypt(encryptedData: EncryptedData): string {
  const key = getEncryptionKey();
  const iv = Buffer.from(encryptedData.iv, "base64");
  const tag = Buffer.from(encryptedData.tag, "base64");

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);

  let decrypted = decipher.update(encryptedData.content, "base64", "utf8");
  decrypted += decipher.final("utf8");

  return decrypted;
}

/**
 * 生成随机密码 (用于订单查询密码) - 使用加密安全的随机数
 */
export function generatePassword(length: number = 8): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
  let password = "";
  for (let i = 0; i < length; i++) {
    password += chars.charAt(crypto.randomInt(0, chars.length));
  }
  return password;
}

/**
 * 生成订单号 - 使用加密安全的随机数
 */
export function generateOrderNo(): string {
  const now = new Date();
  const year = now.getFullYear().toString().slice(-2);
  const month = (now.getMonth() + 1).toString().padStart(2, "0");
  const day = now.getDate().toString().padStart(2, "0");
  const hour = now.getHours().toString().padStart(2, "0");
  const minute = now.getMinutes().toString().padStart(2, "0");
  const second = now.getSeconds().toString().padStart(2, "0");
  // 使用加密安全的随机数，增加到6位
  const random = crypto.randomInt(0, 1000000).toString().padStart(6, "0");

  return `${year}${month}${day}${hour}${minute}${second}${random}`;
}

/**
 * 哈希密码 (用于支付回调签名验证)
 */
export function hashSHA256(data: string): string {
  return crypto.createHash("sha256").update(data).digest("hex");
}

/**
 * MD5 哈希 (某些支付接口需要)
 */
export function hashMD5(data: string): string {
  return crypto.createHash("md5").update(data).digest("hex");
}
