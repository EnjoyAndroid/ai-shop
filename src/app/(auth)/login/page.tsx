"use client";

import { useState, Suspense } from "react";
import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import SliderCaptcha from "@/components/slider-captcha";
import { PasswordInput } from "@/components/ui/password-input";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const registered = searchParams.get("registered");
  const callbackUrl = searchParams.get("callbackUrl") || "/dashboard";

  const [account, setAccount] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [requireCaptcha, setRequireCaptcha] = useState(false);
  const [showCaptcha, setShowCaptcha] = useState(false);
  const [captchaToken, setCaptchaToken] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    // 邮箱格式验证
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(account)) {
      setError("请输入有效的邮箱地址");
      return;
    }

    // 密码长度验证
    if (password.length < 8) {
      setError("密码至少8位");
      return;
    }

    // 如果需要验证码但还没验证，弹出验证码
    if (requireCaptcha && !captchaToken) {
      setShowCaptcha(true);
      return;
    }

    await doLogin();
  };

  const doLogin = async (token?: string) => {
    setLoading(true);

    try {
      // 先调用自定义登录 API 检查验证码
      const checkResponse = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          account,
          password,
          captchaToken: token || captchaToken,
        }),
      });

      const checkData = await checkResponse.json();

      if (!checkResponse.ok) {
        setError(checkData.error || "登录失败");
        if (checkData.requireCaptcha) {
          setRequireCaptcha(true);
          setCaptchaToken(""); // 清除旧 token
        }
        setLoading(false);
        return;
      }

      // 验证通过，使用 NextAuth 登录
      const result = await signIn("credentials", {
        account,
        password,
        redirect: false,
        callbackUrl,
      });

      if (result?.error) {
        setError("账号或密码错误");
      } else if (result?.ok) {
        router.push(callbackUrl);
        router.refresh();
      }
    } catch {
      setError("登录失败，请稍后重试");
    } finally {
      setLoading(false);
    }
  };

  const handleCaptchaSuccess = (token: string) => {
    setCaptchaToken(token);
    setShowCaptcha(false);
    doLogin(token);
  };

  return (
    <>
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
              邮箱
            </label>
            <input
              type="text"
              value={account}
              onChange={(e) => setAccount(e.target.value)}
              placeholder="请输入邮箱"
              className="w-full px-4 py-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50"
              autoComplete="email"
              required
            />
          </div>

          <div>
            <label className="block text-sm text-gray-600 mb-1">密码</label>
            <PasswordInput
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="请输入密码"
              className="px-4 py-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50"
              autoComplete="current-password"
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

      {/* 验证码弹窗 */}
      {showCaptcha && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={() => setShowCaptcha(false)}
          />
          <div className="relative bg-white rounded-2xl p-6 shadow-2xl animate-in zoom-in-95 duration-200 mx-4 w-[360px]">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-800">安全验证</h3>
              <button
                type="button"
                onClick={() => setShowCaptcha(false)}
                className="text-gray-400 hover:text-gray-600 transition-colors"
              >
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
            <SliderCaptcha
              onSuccess={handleCaptchaSuccess}
              onError={() => {}}
            />
          </div>
        </div>
      )}
    </>
  );
}

export default function LoginPage() {
  return (
    <div className="min-h-screen bg-gray-50">
      {/* 顶部导航 */}
      <header className="bg-white shadow-sm">
        <div className="container mx-auto px-4">
          <div className="h-16 flex items-center">
            <Link href="/" className="text-xl font-bold text-primary">
              AI Shop
            </Link>
          </div>
        </div>
      </header>

      <div className="flex items-center justify-center px-4 py-12">
        <div className="max-w-md w-full">
          <div className="text-center mb-8">
            <h1 className="text-2xl font-bold text-gray-800">欢迎回来</h1>
          </div>

          <Suspense fallback={<div className="bg-white rounded-2xl p-8 shadow-sm animate-pulse h-96" />}>
            <LoginForm />
          </Suspense>
        </div>
      </div>
    </div>
  );
}
