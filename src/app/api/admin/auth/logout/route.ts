import { NextResponse } from "next/server";
import { cookies } from "next/headers";

export async function POST() {
  try {
    // 清除 cookie
    cookies().delete("admin_token");

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Admin logout error:", error);
    return NextResponse.json(
      { error: "退出失败" },
      { status: 500 }
    );
  }
}
