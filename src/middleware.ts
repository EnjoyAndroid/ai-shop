import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { jwtVerify } from "jose";

const JWT_SECRET = new TextEncoder().encode(
  process.env.NEXTAUTH_SECRET || "admin-secret-key"
);

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // 后台路由保护（排除登录页和登出API）
  if (
    pathname.startsWith("/admin") &&
    !pathname.startsWith("/admin/login") &&
    !pathname.startsWith("/api/admin/auth")
  ) {
    const adminToken = request.cookies.get("admin_token")?.value;

    // 未登录，重定向到登录页
    if (!adminToken) {
      const loginUrl = new URL("/admin/login", request.url);
      return NextResponse.redirect(loginUrl);
    }

    // 验证 JWT token 有效性
    try {
      const { payload } = await jwtVerify(adminToken, JWT_SECRET);

      // 验证 token 包含必要字段
      if (!payload.id || !payload.username) {
        throw new Error("Invalid token payload");
      }
    } catch (error) {
      // Token 无效或过期，清除 cookie 并重定向到登录页
      const response = NextResponse.redirect(
        new URL("/admin/login", request.url)
      );
      response.cookies.delete("admin_token");
      return response;
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/admin/:path*"],
};
