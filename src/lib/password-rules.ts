import { z } from "zod";

// bcrypt authenticates only the first 72 UTF-8 bytes. Apply this to new
// passwords, not login, so existing accounts can still sign in and change them.
export function passwordSchema(min: number) {
  return z.string().min(min, `密码至少${min}位`).max(72, "密码最多72个字节")
    .refine(value => new TextEncoder().encode(value).length <= 72, "密码最多72个字节（中文通常占3个字节）");
}

export const userPasswordSchema = passwordSchema(8);
export const adminPasswordSchema = passwordSchema(12);
