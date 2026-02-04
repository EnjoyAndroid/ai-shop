import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { logError } from "@/lib/logger";

export async function POST() {
  try {
    // 清除 cookie
    cookies().delete("admin_token");

    return NextResponse.json({ success: true });
  } catch (error) {
    logError("Admin logout", error);
    return NextResponse.json(
      { error: "退出失败" },
      { status: 500 }
    );
  }
}
