import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { logError } from "@/lib/logger";
import prisma from "@/lib/db";
import { getAdminSecret } from "@/lib/security-config";
import { jwtVerify } from "jose";

export async function POST() {
  try {
    const cookieStore=await cookies();
    const token=cookieStore.get("admin_token")?.value;
    let payload: ({id?:unknown;sessionVersion?:unknown}&Record<string,unknown>)|undefined;
    if(token){
      try { payload=(await jwtVerify(token,getAdminSecret(),{algorithms:["HS256"]})).payload; }
      catch { /* Invalid or expired tokens only need cookie removal. */ }
    }
    if(typeof payload?.id==='string' && typeof payload.sessionVersion==='number' && Number.isInteger(payload.sessionVersion)) {
      // Conditional revocation makes logout idempotent; an old token cannot evict a later login.
      await prisma.admin.updateMany({where:{id:payload.id,sessionVersion:payload.sessionVersion},data:{sessionVersion:{increment:1}}});
    }
    // 清除 cookie
    cookieStore.delete("admin_token");

    return NextResponse.json({ success: true });
  } catch (error) {
    logError("Admin logout", error);
    return NextResponse.json(
      { error: "退出失败" },
      { status: 500 }
    );
  }
}
