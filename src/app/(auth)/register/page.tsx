"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import SliderCaptcha from "@/components/slider-captcha";
import { PasswordInput } from "@/components/ui/password-input";

export default function RegisterPage() {
  const router = useRouter();
  const [formData, setFormData] = useState({
    email: "",
    password: "",
    confirmPassword: "",
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [showCaptcha, setShowCaptcha] = useState(false);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData((prev) => ({
      ...prev,
      [e.target.name]: e.target.value,
    }));
  };

  // 点击注册按钮，先验证表单，再弹出验证码
  const handleRegisterClick = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    // 邮箱格式验证
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(formData.email)) {
      setError("请输入有效的邮箱地址");
      return;
    }

    if (formData.password.length < 8) {
      setError("密码至少8位");
      return;
    }

    if (formData.password !== formData.confirmPassword) {
      setError("两次密码输入不一致");
      return;
    }

    // 表单验证通过，显示验证码弹窗
    setShowCaptcha(true);
  };

  // 验证码验证成功后提交注册
  const handleCaptchaSuccess = async (token: string) => {
    setShowCaptcha(false);
    setLoading(true);

    try {
      const response = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: formData.email,
          password: formData.password,
          captchaToken: token,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "注册失败");
      }

      router.push("/login?registered=1");
    } catch (err) {
      setError(err instanceof Error ? err.message : "注册失败");
    } finally {
      setLoading(false);
    }
  };

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
            <h1 className="text-2xl font-bold text-gray-800">创建您的账号</h1>
          </div>

        <form onSubmit={handleRegisterClick} className="bg-white rounded-2xl p-8 shadow-sm">
          <h1 className="text-2xl font-bold text-gray-800 mb-6">注册</h1>

          {error && (
            <div className="mb-4 p-3 bg-red-50 text-red-600 rounded-lg text-sm">
              {error}
            </div>
          )}

          <div className="space-y-4">
            <div>
              <label className="block text-sm text-gray-600 mb-1">
                邮箱 <span className="text-red-500">*</span>
              </label>
              <input
                type="email"
                name="email"
                value={formData.email}
                onChange={handleChange}
              placeholder="user@example.com"
                className="w-full px-4 py-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50"
                autoComplete="off"
                required
              />
            </div>

            <div>
              <label className="block text-sm text-gray-600 mb-1">
                密码 <span className="text-red-500">*</span>
              </label>
              <PasswordInput
                name="password"
                value={formData.password}
                onChange={handleChange}
                placeholder="至少8位密码"
                className="px-4 py-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50"
                autoComplete="new-password"
                required
              />
            </div>

            <div>
              <label className="block text-sm text-gray-600 mb-1">
                确认密码 <span className="text-red-500">*</span>
              </label>
              <PasswordInput
                name="confirmPassword"
                value={formData.confirmPassword}
                onChange={handleChange}
                placeholder="再次输入密码"
                className="px-4 py-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50"
                autoComplete="new-password"
                required
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 bg-primary text-white rounded-lg font-semibold hover:bg-primary/90 disabled:opacity-50"
            >
              {loading ? "注册中..." : "注册"}
            </button>
          </div>

          <div className="mt-6 text-center text-sm text-gray-500">
            已有账号？{" "}
            <Link href="/login" className="text-primary hover:underline">
              立即登录
            </Link>
          </div>
        </form>
        </div>
      </div>

      {/* 验证码弹窗 */}
      {showCaptcha && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          {/* 遮罩层 */}
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={() => setShowCaptcha(false)}
          />

          {/* 弹窗内容 */}
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
    </div>
  );
}
