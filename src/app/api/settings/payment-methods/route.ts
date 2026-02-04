import { NextResponse } from "next/server";
import prisma from "@/lib/db";
import { logError } from "@/lib/logger";

// 禁用缓存，每次请求都从数据库读取
export const dynamic = "force-dynamic";

// 获取启用的支付方式（公开接口）
export async function GET() {
  try {
    const settingsRows = await prisma.systemSetting.findMany({
      where: {
        key: {
          in: [
            "alipayEnabled",
            "wechatEnabled",
            "usdtEnabled",
            "balanceEnabled",
          ],
        },
      },
    });

    const settings: Record<string, boolean> = {};
    settingsRows.forEach((row) => {
      settings[row.key] = row.value === "true";
    });

    // 构建启用的支付方式列表
    const methods = [];

    if (settings["wechatEnabled"]) {
      methods.push({ value: "WECHAT", label: "微信", icon: "💚" });
    }
    if (settings["alipayEnabled"]) {
      methods.push({ value: "ALIPAY", label: "支付宝", icon: "💳" });
    }
    if (settings["usdtEnabled"]) {
      methods.push({ value: "USDT_TRC20", label: "USDT(TRON-TRC20)", icon: "₮" });
    }
    if (settings["balanceEnabled"]) {
      methods.push({ value: "BALANCE", label: "余额", icon: "💵" });
    }

    // 如果没有任何设置，默认显示所有支付方式
    if (methods.length === 0) {
      methods.push(
        { value: "WECHAT", label: "微信", icon: "💚" },
        { value: "ALIPAY", label: "支付宝", icon: "💳" },
        { value: "USDT_TRC20", label: "USDT(TRON-TRC20)", icon: "₮" },
        { value: "BALANCE", label: "余额", icon: "💵" }
      );
    }

    return NextResponse.json({ methods });
  } catch (error) {
    logError("Get payment methods", error);
    // 出错时返回默认支付方式
    return NextResponse.json({
      methods: [
        { value: "WECHAT", label: "微信", icon: "💚" },
        { value: "ALIPAY", label: "支付宝", icon: "💳" },
        { value: "USDT_TRC20", label: "USDT(TRON-TRC20)", icon: "₮" },
        { value: "BALANCE", label: "余额", icon: "💵" },
      ],
    });
  }
}
