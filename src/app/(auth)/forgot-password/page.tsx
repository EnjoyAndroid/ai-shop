"use client";

import { useState } from "react";
import Link from "next/link";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const response = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "发送失败");
      }

      setSuccess(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "发送失败，请稍后重试");
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
            <h1 className="text-2xl font-bold text-gray-800">找回密码</h1>
          </div>

        <div className="bg-white rounded-2xl p-8 shadow-sm">
          <h1 className="text-2xl font-bold text-gray-800 mb-6">忘记密码</h1>

          {success ? (
            <div className="text-center">
              <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <span className="text-3xl">✉️</span>
              </div>
              <h2 className="text-lg font-semibold text-gray-800 mb-2">
                邮件已发送
              </h2>
              <p className="text-gray-500 mb-6">
                重置密码链接已发送到 <strong>{email}</strong>，请查收邮件并点击链接重置密码。
              </p>
              <p className="text-sm text-gray-400 mb-4">
                没收到邮件？请检查垃圾邮件文件夹
              </p>
              <Link
                href="/login"
                className="text-primary hover:underline"
              >
                返回登录
              </Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit}>
              <p className="text-gray-500 text-sm mb-6">
                请输入您的注册邮箱，我们将发送重置密码链接到您的邮箱。
              </p>

              {error && (
                <div className="mb-4 p-3 bg-red-50 text-red-600 rounded-lg text-sm">
                  {error}
                </div>
              )}

              <div className="space-y-4">
                <div>
                  <label className="block text-sm text-gray-600 mb-1">
                    邮箱地址
                  </label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="请输入注册邮箱"
                    className="w-full px-4 py-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50"
                    required
                  />
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-3 bg-primary text-white rounded-lg font-semibold hover:bg-primary/90 disabled:opacity-50"
                >
                  {loading ? "发送中..." : "发送重置链接"}
                </button>
              </div>

              <div className="mt-6 text-center text-sm text-gray-500">
                <Link href="/login" className="text-primary hover:underline">
                  返回登录
                </Link>
              </div>
            </form>
          )}
        </div>
        </div>
      </div>
    </div>
  );
}
