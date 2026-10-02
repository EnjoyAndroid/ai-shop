"use client";

import { useState, useEffect } from "react";
import { AdminSidebar } from "@/components/admin/sidebar";
import { PasswordInput } from "@/components/ui/password-input";

interface Settings {
  siteName: string;
  siteUrl: string;
  orderExpireMinutes: string;
  orderAutoDeleteDays: string;
  alipayEnabled: string;
  wechatEnabled: string;
  usdtEnabled: string;
  balanceEnabled: string;
  telegramUrl: string;
}

export default function AdminSettingsPage() {
  const [settings, setSettings] = useState<Settings>({
    siteName: "AI Shop",
    siteUrl: "http://localhost:3000",
    orderExpireMinutes: "30",
    orderAutoDeleteDays: "7",
    alipayEnabled: "true",
    wechatEnabled: "true",
    usdtEnabled: "false",
    balanceEnabled: "true",
    telegramUrl: "",
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // 修改密码相关状态
  const [passwordForm, setPasswordForm] = useState({
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
  });
  const [savingPassword, setSavingPassword] = useState(false);
  const [passwordMessage, setPasswordMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      const res = await fetch("/api/admin/settings");
      const data = await res.json();
      if (data.settings) {
        setSettings({ ...settings, ...data.settings });
      }
    } catch (err) {
      console.error("Failed to fetch settings:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setMessage(null);

    try {
      const res = await fetch("/api/admin/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "保存失败");
      }

      setMessage({ type: "success", text: "设置已保存" });
    } catch (err) {
      setMessage({ type: "error", text: err instanceof Error ? err.message : "保存失败" });
    } finally {
      setSaving(false);
    }
  };

  const handleChange = (key: keyof Settings, value: string) => {
    setSettings({ ...settings, [key]: value });
  };

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingPassword(true);
    setPasswordMessage(null);

    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      setPasswordMessage({ type: "error", text: "两次输入的新密码不一致" });
      setSavingPassword(false);
      return;
    }

    if (passwordForm.newPassword.length < 12 || passwordForm.newPassword.length > 72) {
      setPasswordMessage({ type: "error", text: "新密码需要12至72位" });
      setSavingPassword(false);
      return;
    }

    try {
      const res = await fetch("/api/admin/password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          currentPassword: passwordForm.currentPassword,
          newPassword: passwordForm.newPassword,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "修改失败");
      }

      setPasswordMessage({ type: "success", text: "密码修改成功，请重新登录" });
      window.location.href = "/admin/login";
      setPasswordForm({ currentPassword: "", newPassword: "", confirmPassword: "" });
    } catch (err) {
      setPasswordMessage({ type: "error", text: err instanceof Error ? err.message : "修改失败" });
    } finally {
      setSavingPassword(false);
    }
  };

  return (
    <div className="flex min-h-screen bg-gray-100">
      <AdminSidebar />

      <main className="flex-1 p-8">
        <h1 className="text-2xl font-bold text-gray-800 mb-8">系统设置</h1>

        {loading ? (
          <div className="text-center text-gray-500">加载中...</div>
        ) : (
          <form onSubmit={handleSubmit} className="max-w-2xl space-y-6">
            {message && (
              <div
                className={`p-4 rounded-lg ${
                  message.type === "success"
                    ? "bg-green-50 text-green-600"
                    : "bg-red-50 text-red-600"
                }`}
              >
                {message.text}
              </div>
            )}

            {/* 基本设置 */}
            <div className="bg-white rounded-xl p-6 shadow-sm">
              <h2 className="text-lg font-bold text-gray-800 mb-4">基本设置</h2>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm text-gray-600 mb-1">站点名称</label>
                  <input
                    type="text"
                    value={settings.siteName}
                    onChange={(e) => handleChange("siteName", e.target.value)}
                    className="w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50"
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-600 mb-1">站点URL</label>
                  <input
                    type="text"
                    value={settings.siteUrl}
                    onChange={(e) => handleChange("siteUrl", e.target.value)}
                    className="w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50"
                  />
                </div>
              </div>
            </div>

            {/* 客服设置 */}
            <div className="bg-white rounded-xl p-6 shadow-sm">
              <h2 className="text-lg font-bold text-gray-800 mb-4">客服设置</h2>
              <label htmlFor="telegramUrl" className="block text-sm text-gray-600 mb-1">Telegram 客服</label>
              <input
                id="telegramUrl"
                type="text"
                value={settings.telegramUrl}
                onChange={(e) => handleChange("telegramUrl", e.target.value)}
                placeholder="@用户名 或 https://t.me/用户名"
                maxLength={100}
                className="w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50"
              />
              <p className="text-xs text-gray-500 mt-1">留空时隐藏 Telegram 入口；保存后刷新商城即可生效，无需重新部署。</p>
            </div>

            {/* 订单设置 */}
            <div className="bg-white rounded-xl p-6 shadow-sm">
              <h2 className="text-lg font-bold text-gray-800 mb-4">订单设置</h2>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm text-gray-600 mb-1">
                    订单过期时间（分钟）
                  </label>
                  <input
                    type="number"
                    value={settings.orderExpireMinutes}
                    onChange={(e) => handleChange("orderExpireMinutes", e.target.value)}
                    className="w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    未支付订单超过此时间自动取消
                  </p>
                </div>
                <div>
                  <label className="block text-sm text-gray-600 mb-1">
                    订单自动删除（天）
                  </label>
                  <input
                    type="number"
                    value={settings.orderAutoDeleteDays}
                    onChange={(e) => handleChange("orderAutoDeleteDays", e.target.value)}
                    className="w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    已完成/已取消订单超过此天数自动删除
                  </p>
                </div>
              </div>
            </div>

            {/* 支付设置 */}
            <div className="bg-white rounded-xl p-6 shadow-sm">
              <h2 className="text-lg font-bold text-gray-800 mb-4">支付方式</h2>
              <div className="space-y-4">
                <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                  <div className="flex items-center gap-3">
                    <img src="/icons/alipay.png" alt="支付宝" className="w-8 h-8 object-contain shrink-0" />
                    <div>
                      <p className="font-medium">支付宝</p>
                      <p className="text-sm text-gray-500">通过虎皮椒接入</p>
                    </div>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={settings.alipayEnabled === "true"}
                      onChange={(e) =>
                        handleChange("alipayEnabled", e.target.checked ? "true" : "false")
                      }
                      className="sr-only peer"
                    />
                    <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-primary/20 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary"></div>
                  </label>
                </div>

                <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                  <div className="flex items-center gap-3">
                    <img src="/icons/wechat.png" alt="微信" className="w-8 h-8 object-contain shrink-0" />
                    <div>
                      <p className="font-medium">微信支付</p>
                      <p className="text-sm text-gray-500">通过虎皮椒接入</p>
                    </div>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={settings.wechatEnabled === "true"}
                      onChange={(e) =>
                        handleChange("wechatEnabled", e.target.checked ? "true" : "false")
                      }
                      className="sr-only peer"
                    />
                    <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-primary/20 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary"></div>
                  </label>
                </div>

                <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                  <div className="flex items-center gap-3">
                    <span className="w-8 h-8 rounded-full flex items-center justify-center text-white text-lg font-bold" style={{ backgroundColor: "#26A17B" }}>₮</span>
                    <div>
                      <p className="font-medium">USDT</p>
                      <p className="text-sm text-gray-500">TRC20/ERC20</p>
                    </div>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={settings.usdtEnabled === "true"}
                      onChange={(e) =>
                        handleChange("usdtEnabled", e.target.checked ? "true" : "false")
                      }
                      className="sr-only peer"
                    />
                    <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-primary/20 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary"></div>
                  </label>
                </div>

                <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                  <div className="flex items-center gap-3">
                    <span className="text-2xl">💵</span>
                    <div>
                      <p className="font-medium">余额支付</p>
                      <p className="text-sm text-gray-500">会员余额支付</p>
                    </div>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={settings.balanceEnabled === "true"}
                      onChange={(e) =>
                        handleChange("balanceEnabled", e.target.checked ? "true" : "false")
                      }
                      className="sr-only peer"
                    />
                    <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-primary/20 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary"></div>
                  </label>
                </div>
              </div>
            </div>

            {/* 提交按钮 */}
            <button
              type="submit"
              disabled={saving}
              className="w-full py-3 bg-primary text-white rounded-lg font-semibold hover:bg-primary/90 disabled:opacity-50"
            >
              {saving ? "保存中..." : "保存设置"}
            </button>
          </form>
        )}

        {/* 修改密码 */}
        {!loading && (
          <form onSubmit={handlePasswordSubmit} className="max-w-2xl mt-6">
            <div className="bg-white rounded-xl p-6 shadow-sm">
              <h2 className="text-lg font-bold text-gray-800 mb-4">修改密码</h2>

              {passwordMessage && (
                <div
                  className={`p-4 rounded-lg mb-4 ${
                    passwordMessage.type === "success"
                      ? "bg-green-50 text-green-600"
                      : "bg-red-50 text-red-600"
                  }`}
                >
                  {passwordMessage.text}
                </div>
              )}

              <div className="space-y-4">
                <div>
                  <label className="block text-sm text-gray-600 mb-1">当前密码</label>
                  <PasswordInput
                    value={passwordForm.currentPassword}
                    onChange={(e) =>
                      setPasswordForm({ ...passwordForm, currentPassword: e.target.value })
                    }
                    className="px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50"
                    autoComplete="one-time-code"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-600 mb-1">新密码</label>
                  <PasswordInput
                    value={passwordForm.newPassword}
                    onChange={(e) =>
                      setPasswordForm({ ...passwordForm, newPassword: e.target.value })
                    }
                    className="px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50"
                    autoComplete="new-password"
                    required
                    minLength={8}
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-600 mb-1">确认新密码</label>
                  <PasswordInput
                    value={passwordForm.confirmPassword}
                    onChange={(e) =>
                      setPasswordForm({ ...passwordForm, confirmPassword: e.target.value })
                    }
                    className="px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50"
                    autoComplete="new-password"
                    required
                    minLength={8}
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={savingPassword}
                className="w-full mt-4 py-3 bg-gray-800 text-white rounded-lg font-semibold hover:bg-gray-700 disabled:opacity-50"
              >
                {savingPassword ? "修改中..." : "修改密码"}
              </button>
            </div>
          </form>
        )}
      </main>
    </div>
  );
}
