import { NextRequest, NextResponse } from "next/server";
import { v2 as cloudinary } from "cloudinary";
import sharp from "sharp";
import { getAdminSession } from "@/lib/admin-auth";
import { rateLimit } from "@/lib/rate-limit";
import { logError } from "@/lib/logger";

// 配置 Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// 允许的图片类型
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp"];
// 最大文件大小 (2MB)
const MAX_SIZE = 2 * 1024 * 1024;

export async function POST(request: NextRequest) {
  const admin = await getAdminSession();
  if (!admin) return NextResponse.json({ error: "未授权" }, { status: 401 });
  try {
    if (!await rateLimit("upload-user", admin.id, 20, 3600) || !await rateLimit("upload-total", "site", 200, 86400)) return NextResponse.json({ error: "上传额度已用完，请稍后重试" }, { status: 429 });
    // 检查 Cloudinary 配置
    if (!process.env.CLOUDINARY_CLOUD_NAME || !process.env.CLOUDINARY_API_KEY || !process.env.CLOUDINARY_API_SECRET) {
      return NextResponse.json(
        { error: "服务器配置错误" },
        { status: 500 }
      );
    }

    const formData = await request.formData();
    const file = formData.get("file") as File | null;

    if (!(file instanceof File)) {
      return NextResponse.json(
        { error: "请选择文件" },
        { status: 400 }
      );
    }

    // 验证文件类型
    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json(
        { error: "只支持 JPG、PNG、GIF、WebP 格式" },
        { status: 400 }
      );
    }

    // 验证文件大小
    if (file.size > MAX_SIZE) {
      return NextResponse.json(
        { error: "文件大小不能超过 2MB" },
        { status: 400 }
      );
    }

    // 将文件转换为 base64
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    const image = sharp(buffer, { limitInputPixels: 16000000, animated: false });
    const metadata = await image.metadata();
    if (!["jpeg", "png", "gif", "webp"].includes(metadata.format || "")) return NextResponse.json({ error: "文件内容不是支持的图片" }, { status: 400 });
    // 重新编码以验证解码结果并剥离附加元数据和混入的非图片内容。
    const sanitized = await image.resize({ width: 2000, height: 2000, fit: "inside", withoutEnlargement: true }).webp().toBuffer();
    const base64 = `data:image/webp;base64,${sanitized.toString("base64")}`;

    // 上传到 Cloudinary
    const result = await cloudinary.uploader.upload(base64, {
      folder: "products",
      resource_type: "image",
    });

    return NextResponse.json({
      success: true,
      url: result.secure_url,
    });
  } catch (error) {
    logError("Upload", error);
    return NextResponse.json(
      { error: "上传失败，请稍后重试" },
      { status: 500 }
    );
  }
}
