import { NextResponse } from "next/server";
import {
  generateSliderPosition,
  generateCaptchaToken,
  storeCaptcha,
} from "@/lib/captcha";
import { logError } from "@/lib/logger";

export async function POST() {
  try {
    // 生成随机滑块位置
    const position = generateSliderPosition();

    // 生成唯一 token
    const token = generateCaptchaToken();

    // 存储到 Redis
    await storeCaptcha(token, position);

    // 返回 token 和缺口位置
    return NextResponse.json({
      success: true,
      token,
      position, // 返回缺口位置给前端显示
      config: {
        width: 300,
        height: 150,
        sliderSize: 40,
      },
    });
  } catch (error) {
    logError("Generate captcha", error);
    return NextResponse.json(
      { error: "生成验证码失败" },
      { status: 500 }
    );
  }
}
