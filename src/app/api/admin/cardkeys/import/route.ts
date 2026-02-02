import { NextRequest, NextResponse } from "next/server";
import { importCardKeys } from "@/lib/services/product.service";
import { importCardKeysSchema } from "@/lib/validations";
import { getAdminSession } from "@/lib/admin-auth";

export async function POST(request: NextRequest) {
  const admin = await getAdminSession();
  if (!admin) {
    return NextResponse.json({ error: "未授权" }, { status: 401 });
  }

  try {
    const body = await request.json();

    // 验证请求数据
    const validationResult = importCardKeysSchema.safeParse(body);
    if (!validationResult.success) {
      return NextResponse.json(
        { error: validationResult.error.errors[0].message },
        { status: 400 }
      );
    }

    const { productId, cardKeys, batchNo } = validationResult.data;

    // 解析卡密 (每行一个)
    const cardKeyList = cardKeys
      .split("\n")
      .map((k) => k.trim())
      .filter((k) => k.length > 0);

    if (cardKeyList.length === 0) {
      return NextResponse.json(
        { error: "请输入至少一个卡密" },
        { status: 400 }
      );
    }

    // 导入卡密
    const count = await importCardKeys(productId, cardKeyList, batchNo);

    return NextResponse.json({
      success: true,
      count,
      message: `成功导入 ${count} 条卡密`,
    });
  } catch (error) {
    console.error("Import cardkeys error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "导入失败" },
      { status: 500 }
    );
  }
}
