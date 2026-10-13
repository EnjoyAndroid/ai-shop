import { z } from "zod";

export const qrImageUrlSchema = z.string().trim().max(2048).refine((value) => {
  if (!value) return true;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password;
  } catch { return false; }
}, "请上传二维码或填写有效的 HTTPS 图片地址");
