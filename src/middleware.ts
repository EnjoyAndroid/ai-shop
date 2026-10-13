import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { jwtVerify } from "jose";

import { getAdminSecret } from "@/lib/security-config";
import { browserWriteAllowed, contentSecurityPolicy } from "@/lib/browser-security";

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (!browserWriteAllowed(request, pathname, process.env.NEXTAUTH_URL)) {
    return NextResponse.json({ error: "请求来源无效，请从本站页面重试", code: "ORIGIN_REJECTED" }, { status: 403, headers: { "Cache-Control": "no-store" } });
  }

  const nonce = btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(16))));
  const policy = contentSecurityPolicy(nonce, process.env.NODE_ENV === "development");
  const headers = new Headers(request.headers);
  headers.set("x-nonce", nonce);
  // Next.js reads this request header to nonce its bootstrap and inline scripts.
  headers.set("Content-Security-Policy", policy);

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
      const { payload } = await jwtVerify(adminToken, getAdminSecret(), { algorithms: ["HS256"] });

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

  const response = NextResponse.next({ request: { headers } });
  response.headers.set("Content-Security-Policy", policy);
  if (!pathname.startsWith("/api/")) response.headers.set("Cache-Control", "private, no-store");
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|favicon.svg|fonts/|icons/).*)"],
};
