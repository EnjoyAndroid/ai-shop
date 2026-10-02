import { NextResponse } from "next/server";
// 所有会话签发统一经过 NextAuth Credentials authorize 的限流和验证码校验。
export async function POST() {
  return NextResponse.json({ error: "请使用登录页面完成认证" }, { status: 410 });
}
