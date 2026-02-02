"use client";

import { useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { PasswordInput } from "@/components/ui/password-input";

function ResetPasswordForm() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token") || "";

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (password.length < 6) {
      setError("密码长度不能少于6位");
      return;
    }

    if (password !== confirmPassword) {
      setError("两次输入的密码不一致");
      return;
    }

    setLoading(true);

    try {
      const response = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "重置失败");
      }

      setSuccess(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "重置失败，请稍后重试");
    } finally {
      setLoading(false);
    }
  };

  if (!token) {
    return (
      <div className="bg-white rounded-2xl p-8 shadow-sm text-center">
        <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <span className="text-3xl">❌</span>
        </div>
        <h2 className="text-lg font-semibold text-gray-800 mb-2">链接无效</h2>
        <p className="text-gray-500 mb-6">重置密码链接无效或已过期</p>
        <Link href="/forgot-password" className="text-primary hover:underline">
          重新获取重置链接
        </Link>
      </div>
    );
  }

  if (success) {
    return (
      <div className="bg-white rounded-2xl p-8 shadow-sm text-center">
        <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <span className="text-3xl">✅</span>
        </div>
        <h2 className="text-lg font-semibold text-gray-800 mb-2">密码重置成功</h2>
        <p className="text-gray-500 mb-6">您的密码已成功重置，请使用新密码登录</p>
        <Link
          href="/login"
          className="inline-block px-6 py-3 bg-primary text-white rounded-lg font-semibold hover:bg-primary/90"
        >
          去登录
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="bg-white rounded-2xl p-8 shadow-sm">
      <h1 className="text-2xl font-bold text-gray-800 mb-2">设置新密码</h1>
      <p className="text-gray-500 text-sm mb-6">请设置您的新密码</p>

      {error && (
        <div className="mb-4 p-3 bg-red-50 text-red-600 rounded-lg text-sm">
          {error}
        </div>
      )}

      <div className="space-y-4">
        <div>
          <label className="block text-sm text-gray-600 mb-1">新密码</label>
          <PasswordInput
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="请输入新密码（至少6位）"
            className="px-4 py-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50"
            autoComplete="new-password"
            required
            minLength={6}
          />
        </div>

        <div>
          <label className="block text-sm text-gray-600 mb-1">确认密码</label>
          <PasswordInput
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            placeholder="请再次输入新密码"
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
          {loading ? "重置中..." : "重置密码"}
        </button>
      </div>

      <div className="mt-6 text-center text-sm text-gray-500">
        <Link href="/login" className="text-primary hover:underline">
          返回登录
        </Link>
      </div>
    </form>
  );
}

export default function ResetPasswordPage() {
  return (
    <div className="min-h-screen bg-gray-50">
      {/* 顶部导航 - 与登录页保持一致 */}
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
            <h1 className="text-2xl font-bold text-gray-800">重置密码</h1>
          </div>

          <Suspense fallback={<div className="bg-white rounded-2xl p-8 shadow-sm animate-pulse h-96" />}>
            <ResetPasswordForm />
          </Suspense>
        </div>
      </div>
    </div>
  );
}
