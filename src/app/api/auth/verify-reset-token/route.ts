import { NextRequest, NextResponse } from "next/server";
import redis from "@/lib/redis";

export async function POST(request: NextRequest) {
  try {
    const { token } = await request.json();

    if (!token) {
      return NextResponse.json({ valid: false, error: "参数不完整" }, { status: 400 });
    }

    // 从 Redis 获取用户 ID
    const userId = await redis.get(`reset_password:${token}`);

    if (!userId) {
      return NextResponse.json({ valid: false, error: "重置链接已过期或无效" });
    }

    return NextResponse.json({ valid: true });
  } catch (error) {
    console.error("Verify reset token error:", error);
    return NextResponse.json({ valid: false, error: "验证失败" }, { status: 500 });
  }
}
