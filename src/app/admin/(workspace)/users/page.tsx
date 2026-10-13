"use client";

import { useState, useEffect } from "react";
import { AdminContentLoading } from "@/components/admin/content-loading";

interface User {
  id: string;
  email: string | null;
  phone: string | null;
  name: string | null;
  balance: number;
  totalSpent: number;
  status: string;
  level: {
    name: string;
  } | null;
  _count: {
    orders: number;
  };
  createdAt: string;
}

export default function AdminUsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [adjustAmount, setAdjustAmount] = useState("");
  const [adjustRemark, setAdjustRemark] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchUsers();
  }, []);

  const fetchUsers = async () => {
    try {
      const res = await fetch("/api/admin/users");
      const data = await res.json();
      setUsers(data.users || []);
    } catch (err) {
      console.error("Failed to fetch users:", err);
    } finally {
      setLoading(false);
    }
  };

  const openAdjustModal = (user: User) => {
    setSelectedUser(user);
    setAdjustAmount("");
    setAdjustRemark("");
    setShowModal(true);
  };

  const handleAdjustBalance = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUser) return;

    setSaving(true);
    try {
      const res = await fetch(`/api/admin/users/${selectedUser.id}/balance`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount: Math.round(parseFloat(adjustAmount) * 100),
          remark: adjustRemark,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "调整失败");
      }

      setShowModal(false);
      fetchUsers();
    } catch (err) {
      alert(err instanceof Error ? err.message : "调整失败");
    } finally {
      setSaving(false);
    }
  };

  const handleToggleStatus = async (user: User) => {
    const newStatus = user.status === "ACTIVE" ? "BANNED" : "ACTIVE";
    const action = newStatus === "BANNED" ? "封禁" : "解封";

    if (!confirm(`确定要${action}用户 ${user.email || user.phone} 吗？`)) return;

    try {
      const res = await fetch(`/api/admin/users/${user.id}/status`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "操作失败");
      }

      fetchUsers();
    } catch (err) {
      alert(err instanceof Error ? err.message : "操作失败");
    }
  };

  return (
    <>
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-2xl font-bold text-gray-800">用户管理</h1>
          <div className="text-sm text-gray-500">共 {users.length} 位用户</div>
        </div>

        <div className="bg-white rounded-xl shadow-sm overflow-hidden">
          {loading ? (
            <AdminContentLoading />
          ) : users.length === 0 ? (
            <div className="p-8 text-center text-gray-500">暂无用户</div>
          ) : (
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    用户
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    会员等级
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    余额
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    累计消费
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    订单数
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    状态
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    注册时间
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    操作
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {users.map((user) => (
                  <tr key={user.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4">
                      <div>
                        <p className="font-medium text-gray-900">
                          {user.name || "未设置"}
                        </p>
                        <p className="text-sm text-gray-500">
                          {user.email || user.phone}
                        </p>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className="px-2 py-1 text-xs rounded-full bg-yellow-100 text-yellow-600">
                        {user.level?.name || "普通用户"}
                      </span>
                    </td>
                    <td className="px-6 py-4 font-medium text-green-600">
                      ¥{(user.balance / 100).toFixed(2)}
                    </td>
                    <td className="px-6 py-4 text-gray-500">
                      ¥{(user.totalSpent / 100).toFixed(2)}
                    </td>
                    <td className="px-6 py-4 text-gray-500">
                      {user._count.orders}
                    </td>
                    <td className="px-6 py-4">
                      <span
                        className={`px-2 py-1 text-xs rounded-full ${
                          user.status === "ACTIVE"
                            ? "bg-green-100 text-green-600"
                            : "bg-red-100 text-red-600"
                        }`}
                      >
                        {user.status === "ACTIVE" ? "正常" : "已封禁"}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-500">
                      {new Date(user.createdAt).toLocaleDateString("zh-CN")}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => openAdjustModal(user)}
                          className="text-primary hover:underline text-sm"
                        >
                          调整余额
                        </button>
                        <button
                          onClick={() => handleToggleStatus(user)}
                          className={`hover:underline text-sm ${
                            user.status === "ACTIVE"
                              ? "text-red-500"
                              : "text-green-500"
                          }`}
                        >
                          {user.status === "ACTIVE" ? "封禁" : "解封"}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* 调整余额弹窗 */}
        {showModal && selectedUser && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-white rounded-xl p-6 w-full max-w-md">
              <h2 className="text-xl font-bold text-gray-800 mb-4">调整余额</h2>

              <div className="mb-4 p-4 bg-gray-50 rounded-lg">
                <p className="text-sm text-gray-500">用户</p>
                <p className="font-medium">{selectedUser.email || selectedUser.phone}</p>
                <p className="text-sm text-gray-500 mt-2">当前余额</p>
                <p className="font-bold text-green-600">
                  ¥{(selectedUser.balance / 100).toFixed(2)}
                </p>
              </div>

              <form onSubmit={handleAdjustBalance} className="space-y-4">
                <div>
                  <label className="block text-sm text-gray-600 mb-1">
                    调整金额 <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={adjustAmount}
                    onChange={(e) => setAdjustAmount(e.target.value)}
                    placeholder="正数增加，负数扣除"
                    className="w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50"
                    required
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    例如：输入 10 增加10元，输入 -5 扣除5元
                  </p>
                </div>

                <div>
                  <label className="block text-sm text-gray-600 mb-1">
                    备注
                  </label>
                  <input
                    type="text"
                    value={adjustRemark}
                    onChange={(e) => setAdjustRemark(e.target.value)}
                    placeholder="调整原因"
                    className="w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50"
                  />
                </div>

                <div className="flex gap-3 pt-4">
                  <button
                    type="button"
                    onClick={() => setShowModal(false)}
                    className="flex-1 py-2 border rounded-lg text-gray-600 hover:bg-gray-50"
                  >
                    取消
                  </button>
                  <button
                    type="submit"
                    disabled={saving}
                    className="flex-1 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 disabled:opacity-50"
                  >
                    {saving ? "处理中..." : "确认调整"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </>
  );
}
