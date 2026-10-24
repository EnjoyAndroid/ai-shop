import { NextRequest, NextResponse } from "next/server";
import { importCardKeys } from "@/lib/services/product.service";
import { importCardKeysSchema } from "@/lib/validations";
import { getAdminSession } from "@/lib/admin-auth";
import { rateLimit } from "@/lib/rate-limit";
import { CARDKEY_IMPORT_BYTES } from "@/lib/cardkey-rules";
import { readBoundedJson } from "@/lib/request-body";
import { orderError } from "@/lib/order-http";

export async function POST(request: NextRequest) {
  const admin = await getAdminSession();
  if (!admin) {
    return NextResponse.json({ error: "未授权" }, { status: 401 });
  }

  try {
    if (!await rateLimit("card-import", admin.id, 20, 3600)) return NextResponse.json({ error: "导入过于频繁，请稍后重试" }, { status: 429 });
    const body = await readBoundedJson(request, CARDKEY_IMPORT_BYTES);

    // 验证请求数据
    const validationResult = importCardKeysSchema.safeParse(body);
    if (!validationResult.success) {
      return NextResponse.json(
        { error: validationResult.error.issues[0].message },
        { status: 400 }
      );
    }

    const { productId, cardKeys, batchNo } = validationResult.data;

    // 导入卡密
    const count = await importCardKeys(productId, cardKeys, batchNo);

    return NextResponse.json({
      success: true,
      count,
      message: `成功导入 ${count} 条卡密`,
    });
  } catch (error) {
    return orderError("Import cardkeys", error);
  }
}
