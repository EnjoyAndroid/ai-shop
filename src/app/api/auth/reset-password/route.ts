import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import prisma from "@/lib/db";
import redis from "@/lib/redis";
import { logError } from "@/lib/logger";
import { userPasswordSchema } from "@/lib/password-rules";
import { isResetGrantCurrent, parseResetGrant, resetTokenKey, resetTokenSchema } from "@/lib/password-reset";

export async function POST(request: NextRequest) {
  try {
    const { token, password } = await request.json();

    if (!resetTokenSchema.safeParse(token).success || typeof password !== "string") {
      return NextResponse.json({ error: "参数不完整" }, { status: 400 });
    }

    const validation = userPasswordSchema.safeParse(password);
    if (!validation.success) {
      return NextResponse.json({ error: validation.error.issues[0].message }, { status: 400 });
    }

    const grant = parseResetGrant(await redis.getdel(resetTokenKey(token)));

    if (!grant || !await isResetGrantCurrent(grant)) {
      return NextResponse.json({ error: "重置链接已过期或无效" }, { status: 400 });
    }

    // 加密新密码
    const hashedPassword = await bcrypt.hash(password, 12);

    // Compare-and-swap: concurrent grants issued for the same account version
    // cannot both succeed, even if both passed the preliminary check.
    const updated = await prisma.user.updateMany({
      where: { id: grant.userId, status: "ACTIVE", sessionVersion: grant.sessionVersion },
      data: { password: hashedPassword, sessionVersion: { increment: 1 } },
    });
    if (updated.count !== 1) return NextResponse.json({ error: "重置链接已过期或无效" }, { status: 400 });

    return NextResponse.json({ success: true });
  } catch (error) {
    logError("Reset password", error);
    return NextResponse.json({ error: "重置失败，请稍后重试" }, { status: 500 });
  }
}
