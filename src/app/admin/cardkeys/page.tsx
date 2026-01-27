"use client";

import { useState, useEffect } from "react";
import { AdminSidebar } from "@/components/admin/sidebar";

interface Product {
  id: string;
  name: string;
  stock: number;
  _count?: {
    cardKeys: number;
  };
}

export default function AdminCardKeysPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [productId, setProductId] = useState("");
  const [cardKeys, setCardKeys] = useState("");
  const [batchNo, setBatchNo] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadingProducts, setLoadingProducts] = useState(true);
  const [result, setResult] = useState<{ success: boolean; message: string } | null>(null);

  useEffect(() => {
    fetchProducts();
  }, []);

  const fetchProducts = async () => {
    try {
      const res = await fetch("/api/admin/products");
      const data = await res.json();
      setProducts(data.products || []);
    } catch (err) {
      console.error("Failed to fetch products:", err);
    } finally {
      setLoadingProducts(false);
    }
  };

  const handleImport = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!productId || !cardKeys.trim()) {
      setResult({ success: false, message: "请选择商品并输入卡密" });
      return;
    }

    setLoading(true);
    setResult(null);

    try {
      const response = await fetch("/api/admin/cardkeys/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productId,
          cardKeys: cardKeys.trim(),
          batchNo: batchNo || undefined,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "导入失败");
      }

      setResult({ success: true, message: `成功导入 ${data.count} 条卡密` });
      setCardKeys("");
      setBatchNo("");
    } catch (err) {
      setResult({
        success: false,
        message: err instanceof Error ? err.message : "导入失败",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen bg-gray-100">
      <AdminSidebar />

      <main className="flex-1 p-8">
        <h1 className="text-2xl font-bold text-gray-800 mb-8">卡密管理</h1>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* 导入卡密 */}
          <div className="bg-white rounded-xl p-6 shadow-sm">
            <h2 className="text-lg font-bold text-gray-800 mb-4">批量导入卡密</h2>

            {result && (
              <div
                className={`mb-4 p-3 rounded-lg text-sm ${
                  result.success
                    ? "bg-green-50 text-green-600"
                    : "bg-red-50 text-red-600"
                }`}
              >
                {result.message}
              </div>
            )}

            <form onSubmit={handleImport} className="space-y-4">
              <div>
                <label className="block text-sm text-gray-600 mb-1">
                  选择商品 <span className="text-red-500">*</span>
                </label>
                <select
                  value={productId}
                  onChange={(e) => setProductId(e.target.value)}
                  className="w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50"
                  required
                  disabled={loadingProducts}
                >
                  <option value="">
                    {loadingProducts ? "加载中..." : "请选择商品"}
                  </option>
                  {products.map((product) => (
                    <option key={product.id} value={product.id}>
                      {product.name} (库存: {product._count?.cardKeys ?? product.stock})
                    </option>
                  ))}
                </select>
                {products.length === 0 && !loadingProducts && (
                  <p className="text-xs text-orange-500 mt-1">
                    暂无商品，请先在商品管理中创建商品
                  </p>
                )}
              </div>

              <div>
                <label className="block text-sm text-gray-600 mb-1">
                  批次号 <span className="text-gray-400">(可选)</span>
                </label>
                <input
                  type="text"
                  value={batchNo}
                  onChange={(e) => setBatchNo(e.target.value)}
                  placeholder="例如: 2024-01-27"
                  className="w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50"
                />
              </div>

              <div>
                <label className="block text-sm text-gray-600 mb-1">
                  卡密内容 <span className="text-red-500">*</span>
                </label>
                <textarea
                  value={cardKeys}
                  onChange={(e) => setCardKeys(e.target.value)}
                  placeholder="每行一个卡密，例如：&#10;abc123&#10;def456&#10;ghi789"
                  rows={10}
                  className="w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50 font-mono text-sm"
                  required
                />
                <p className="text-xs text-gray-500 mt-1">
                  每行一个卡密，将自动加密存储
                </p>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 bg-primary text-white rounded-lg font-semibold hover:bg-primary/90 disabled:opacity-50"
              >
                {loading ? "导入中..." : "导入卡密"}
              </button>
            </form>
          </div>

          {/* 使用说明 */}
          <div className="bg-white rounded-xl p-6 shadow-sm">
            <h2 className="text-lg font-bold text-gray-800 mb-4">使用说明</h2>

            <div className="space-y-4 text-sm text-gray-600">
              <div className="p-4 bg-blue-50 rounded-lg">
                <h3 className="font-semibold text-blue-800 mb-2">📝 导入格式</h3>
                <ul className="list-disc list-inside space-y-1">
                  <li>每行一个卡密</li>
                  <li>支持批量导入，无数量限制</li>
                  <li>空行会自动过滤</li>
                </ul>
              </div>

              <div className="p-4 bg-green-50 rounded-lg">
                <h3 className="font-semibold text-green-800 mb-2">🔐 安全存储</h3>
                <ul className="list-disc list-inside space-y-1">
                  <li>卡密使用 AES-256-GCM 加密</li>
                  <li>数据库中只存储密文</li>
                  <li>发货时自动解密</li>
                </ul>
              </div>

              <div className="p-4 bg-yellow-50 rounded-lg">
                <h3 className="font-semibold text-yellow-800 mb-2">⚠️ 注意事项</h3>
                <ul className="list-disc list-inside space-y-1">
                  <li>导入前请确认商品正确</li>
                  <li>已导入的卡密无法修改</li>
                  <li>建议使用批次号便于管理</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
