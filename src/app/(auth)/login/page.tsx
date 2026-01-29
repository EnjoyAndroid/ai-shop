"use client";

import { useState, Suspense } from "react";
import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const registered = searchParams.get("registered");
  const callbackUrl = searchParams.get("callbackUrl") || "/dashboard";

  const [account, setAccount] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // NextAuth 错误码映射
  const getErrorMessage = (errorCode: string) => {
    const errorMessages: Record<string, string> = {
      CredentialsSignin: "账号或密码错误",
      Configuration: "账号或密码错误",
      AccessDenied: "账号已被禁用",
      Verification: "验证链接已过期",
      Default: "登录失败，请稍后重试",
    };
    return errorMessages[errorCode] || errorMessages.Default;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const result = await signIn("credentials", {
        account,
        password,
        redirect: false,
        callbackUrl,
      });

      if (result?.error) {
        setError(getErrorMessage(result.error));
      } else if (result?.ok) {
        router.push(callbackUrl);
        router.refresh();
      }
    } catch (err) {
      setError("登录失败，请稍后重试");
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="bg-white rounded-2xl p-8 shadow-sm">
      <h1 className="text-2xl font-bold text-gray-800 mb-6">登录</h1>

      {registered && (
        <div className="mb-4 p-3 bg-green-50 text-green-600 rounded-lg text-sm">
          注册成功！请登录您的账号
        </div>
      )}

      {error && (
        <div className="mb-4 p-3 bg-red-50 text-red-600 rounded-lg text-sm">
          {error}
        </div>
      )}

      <div className="space-y-4">
        <div>
          <label className="block text-sm text-gray-600 mb-1">
            邮箱 / 手机号
          </label>
          <input
            type="text"
            value={account}
            onChange={(e) => setAccount(e.target.value)}
            placeholder="请输入邮箱或手机号"
            className="w-full px-4 py-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50"
            required
          />
        </div>

        <div>
          <label className="block text-sm text-gray-600 mb-1">密码</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="请输入密码"
            className="w-full px-4 py-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50"
            required
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full py-3 bg-primary text-white rounded-lg font-semibold hover:bg-primary/90 disabled:opacity-50"
        >
          {loading ? "登录中..." : "登录"}
        </button>
      </div>

      <div className="mt-6 text-center text-sm text-gray-500">
        <div className="mb-2">
          <Link href="/forgot-password" className="text-primary hover:underline">
            忘记密码？
          </Link>
        </div>
        <div>
          还没有账号？{" "}
          <Link href="/register" className="text-primary hover:underline">
            立即注册
          </Link>
        </div>
      </div>
    </form>
  );
}

export default function LoginPage() {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="max-w-md w-full">
        <div className="text-center mb-8">
          <Link href="/" className="text-3xl font-bold text-primary">
            AI Shop
          </Link>
          <p className="text-gray-500 mt-2">欢迎回来</p>
        </div>

        <Suspense fallback={<div className="bg-white rounded-2xl p-8 shadow-sm animate-pulse h-96" />}>
          <LoginForm />
        </Suspense>

        <div className="mt-4 text-center">
          <Link href="/" className="text-sm text-gray-500 hover:text-primary">
            ← 返回首页
          </Link>
        </div>
      </div>
    </div>
  );
}
