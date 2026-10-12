import { z } from "zod";

export const CARDKEY_IMPORT_MAX = 500;
export const CARDKEY_IMPORT_BYTES = 2 * 1024 * 1024;
export const cardKeyContentSchema = z.string().trim().min(1, "请输入卡密").max(10000, "单条卡密最多10000个字符")
  .refine(value => !/[\r\n]/.test(value), "单条卡密不能包含换行");
export const cardKeyBatchSchema = z.string().trim().max(100, "批次号最多100个字符");
export const cardKeyListSchema = z.array(cardKeyContentSchema).min(1, "请输入至少一个卡密")
  .max(CARDKEY_IMPORT_MAX, `每批最多导入${CARDKEY_IMPORT_MAX}条卡密`)
  .refine(keys => keys.reduce((total, key) => total + new TextEncoder().encode(key).length, 0) <= CARDKEY_IMPORT_BYTES, "每批卡密内容不能超过2MB");
export const cardKeyImportTextSchema = z.string().min(1, "请输入卡密内容").max(CARDKEY_IMPORT_BYTES, "每批卡密内容不能超过2MB")
  .transform(value => value.split("\n").map(key => key.trim()).filter(Boolean)).pipe(cardKeyListSchema);
