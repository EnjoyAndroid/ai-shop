import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/db";
import { getAdminSession } from "@/lib/admin-auth";

// 调整用户余额
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const admin = await getAdminSession();
  if (!admin) {
    return NextResponse.json({ error: "未授权" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { amount, remark } = body;

    if (typeof amount !== "number" || amount === 0) {
      return NextResponse.json(
        { error: "请输入有效的调整金额" },
        { status: 400 }
      );
    }

    const user = await prisma.user.findUnique({
      where: { id: params.id },
    });

    if (!user) {
      return NextResponse.json(
        { error: "用户不存在" },
        { status: 404 }
      );
    }

    const newBalance = user.balance + amount;

    if (newBalance < 0) {
      return NextResponse.json(
        { error: "余额不足，无法扣除" },
        { status: 400 }
      );
    }

    // 更新余额
    await prisma.user.update({
      where: { id: params.id },
      data: { balance: newBalance },
    });

    // 记录余额变动日志
    await prisma.balanceLog.create({
      data: {
        userId: params.id,
        type: "ADJUST",
        amount,
        balance: newBalance,
        remark: remark || "管理员调整",
      },
    });

    return NextResponse.json({ success: true, balance: newBalance });
  } catch (error) {
    console.error("Adjust balance error:", error);
    return NextResponse.json(
      { error: "调整余额失败" },
      { status: 500 }
    );
  }
}
