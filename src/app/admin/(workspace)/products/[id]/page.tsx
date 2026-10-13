"use client";

import { useState, useEffect } from "react";
import { AdminContentLoading } from "@/components/admin/content-loading";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";

interface Category {
  id: string;
  name: string;
}

interface Product {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  content: string | null;
  image: string | null;
  categoryId: string;
  price: number;
  originalPrice: number | null;
  sort: number;
  minQuantity: number;
  maxQuantity: number;
  isActive: boolean;
}

export default function AdminEditProductPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const [formData, setFormData] = useState({
    name: "",
    slug: "",
    description: "",
    content: "",
    image: "",
    categoryId: "",
    price: "",
    originalPrice: "",
    sort: "0",
    minQuantity: "1",
    maxQuantity: "10",
    isActive: true,
  });
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    fetchData();
  }, [params.id]);

  const fetchData = async () => {
    try {
      const [categoriesRes, productRes] = await Promise.all([
        fetch("/api/admin/categories"),
        fetch(`/api/admin/products/${params.id}`),
      ]);

      const categoriesData = await categoriesRes.json();
      setCategories(categoriesData.categories || []);

      if (productRes.ok) {
        const productData = await productRes.json();
        const product = productData.product as Product;
        setFormData({
          name: product.name,
          slug: product.slug,
          description: product.description || "",
          content: product.content || "",
          image: product.image || "",
          categoryId: product.categoryId,
          price: (product.price / 100).toString(),
          originalPrice: product.originalPrice != null
            ? (product.originalPrice / 100).toString()
            : "",
          sort: product.sort.toString(),
          minQuantity: product.minQuantity.toString(),
          maxQuantity: product.maxQuantity.toString(),
          isActive: product.isActive,
        });
      } else {
        setError("商品不存在");
      }
    } catch (err) {
      setError("加载失败");
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError("");

    try {
      const res = await fetch(`/api/admin/products/${params.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...formData,
          image: formData.image || null,
          price: Math.round(parseFloat(formData.price) * 100),
          originalPrice: formData.originalPrice
            ? Math.round(parseFloat(formData.originalPrice) * 100)
            : null,
          sort: parseInt(formData.sort) || 0,
          minQuantity: parseInt(formData.minQuantity) || 1,
          maxQuantity: parseInt(formData.maxQuantity) || 10,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "保存失败");
      }

      router.push("/admin/products");
    } catch (err) {
      setError(err instanceof Error ? err.message : "保存失败");
    } finally {
      setSaving(false);
    }
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    try {
      const formDataUpload = new FormData();
      formDataUpload.append("file", file);

      const res = await fetch("/api/upload", {
        method: "POST",
        body: formDataUpload,
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "上传失败");
      }

      setFormData({ ...formData, image: data.url });
    } catch (err) {
      alert(err instanceof Error ? err.message : "上传失败");
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm("确定要删除这个商品吗？此操作不可恢复。")) return;

    try {
      const res = await fetch(`/api/admin/products/${params.id}`, {
        method: "DELETE",
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "删除失败");
      }

      router.push("/admin/products");
    } catch (err) {
      alert(err instanceof Error ? err.message : "删除失败");
    }
  };

  if (loading) {
    return (
      <>
          <AdminContentLoading />
        </>
    );
  }

  if (error && !formData.name) {
    return (
      <>
          <div className="text-center">
            <p className="text-red-500 mb-4">{error}</p>
            <Link href="/admin/products" className="text-primary hover:underline">
              返回商品列表
            </Link>
          </div>
        </>
    );
  }

  return (
    <>
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-2xl font-bold text-gray-800">编辑商品</h1>
          <div className="flex items-center gap-4">
            <button
              onClick={handleDelete}
              className="text-red-500 hover:text-red-600"
            >
              删除商品
            </button>
            <Link
              href="/admin/products"
              className="text-gray-500 hover:text-gray-700"
            >
              ← 返回列表
            </Link>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="max-w-2xl space-y-6">
          {error && (
            <div className="p-4 bg-red-50 text-red-600 rounded-lg">{error}</div>
          )}

          {/* 基本信息 */}
          <div className="bg-white rounded-xl p-6 shadow-sm">
            <h2 className="text-lg font-bold text-gray-800 mb-4">基本信息</h2>
            <div className="space-y-4">
              {/* 商品图片 */}
              <div>
                <label className="block text-sm text-gray-600 mb-1">
                  商品图片
                </label>
                <div className="flex items-start gap-4">
                  {formData.image ? (
                    <div className="relative w-32 h-32 rounded-lg overflow-hidden border">
                      <img
                        src={formData.image}
                        alt="商品图片"
                        className="w-full h-full object-cover"
                      />
                      <button
                        type="button"
                        onClick={() => setFormData({ ...formData, image: "" })}
                        className="absolute top-1 right-1 w-6 h-6 bg-red-500 text-white rounded-full flex items-center justify-center text-xs hover:bg-red-600"
                      >
                        ×
                      </button>
                    </div>
                  ) : (
                    <div className="w-32 h-32 rounded-lg border-2 border-dashed border-gray-300 flex items-center justify-center bg-gray-50">
                      <span className="text-gray-400 text-4xl">📷</span>
                    </div>
                  )}
                  <div className="flex-1">
                    <label className="block">
                      <span className="inline-block px-4 py-2 bg-gray-100 text-gray-700 rounded-lg cursor-pointer hover:bg-gray-200">
                        {uploading ? "上传中..." : "选择图片"}
                      </span>
                      <input
                        type="file"
                        accept="image/jpeg,image/png,image/gif,image/webp"
                        onChange={handleImageUpload}
                        disabled={uploading}
                        className="hidden"
                      />
                    </label>
                    <p className="text-xs text-gray-500 mt-2">
                      支持 JPG、PNG、GIF、WebP，最大 2MB
                    </p>
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-sm text-gray-600 mb-1">
                  商品名称 <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) =>
                    setFormData({ ...formData, name: e.target.value })
                  }
                  className="w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50"
                  required
                />
              </div>

              <div>
                <label className="block text-sm text-gray-600 mb-1">
                  URL标识 <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={formData.slug}
                  onChange={(e) =>
                    setFormData({ ...formData, slug: e.target.value })
                  }
                  className="w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50"
                  required
                />
                <p className="text-xs text-gray-500 mt-1">
                  用于商品链接，如：/product/<span className="text-primary">{formData.slug || 'xxx'}</span>
                </p>
              </div>

              <div>
                <label className="block text-sm text-gray-600 mb-1">
                  分类 <span className="text-red-500">*</span>
                </label>
                <select
                  value={formData.categoryId}
                  onChange={(e) =>
                    setFormData({ ...formData, categoryId: e.target.value })
                  }
                  className="w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50"
                  required
                >
                  <option value="">请选择分类</option>
                  {categories.map((cat) => (
                    <option key={cat.id} value={cat.id}>
                      {cat.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm text-gray-600 mb-1">
                  简短描述
                </label>
                <textarea
                  value={formData.description}
                  onChange={(e) =>
                    setFormData({ ...formData, description: e.target.value })
                  }
                  rows={2}
                  className="w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50"
                />
              </div>

              <div>
                <label className="block text-sm text-gray-600 mb-1">
                  详细说明
                </label>
                <textarea
                  value={formData.content}
                  onChange={(e) =>
                    setFormData({ ...formData, content: e.target.value })
                  }
                  rows={6}
                  className="w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50"
                />
              </div>
            </div>
          </div>

          {/* 价格设置 */}
          <div className="bg-white rounded-xl p-6 shadow-sm">
            <h2 className="text-lg font-bold text-gray-800 mb-4">价格设置</h2>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm text-gray-600 mb-1">
                  售价（元） <span className="text-red-500">*</span>
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={formData.price}
                  onChange={(e) =>
                    setFormData({ ...formData, price: e.target.value })
                  }
                  className="w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50"
                  required
                />
              </div>
              <div>
                <label className="block text-sm text-gray-600 mb-1">
                  原价（元）
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={formData.originalPrice}
                  onChange={(e) =>
                    setFormData({ ...formData, originalPrice: e.target.value })
                  }
                  className="w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50"
                />
              </div>
            </div>
          </div>

          {/* 其他设置 */}
          <div className="bg-white rounded-xl p-6 shadow-sm">
            <h2 className="text-lg font-bold text-gray-800 mb-4">其他设置</h2>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="block text-sm text-gray-600 mb-1">排序</label>
                <input
                  type="number"
                  value={formData.sort}
                  onChange={(e) =>
                    setFormData({ ...formData, sort: e.target.value })
                  }
                  className="w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-600 mb-1">
                  最小购买数量
                </label>
                <input
                  type="number"
                  value={formData.minQuantity}
                  onChange={(e) =>
                    setFormData({ ...formData, minQuantity: e.target.value })
                  }
                  className="w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-600 mb-1">
                  最大购买数量
                </label>
                <input
                  type="number"
                  value={formData.maxQuantity}
                  onChange={(e) =>
                    setFormData({ ...formData, maxQuantity: e.target.value })
                  }
                  className="w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50"
                />
              </div>
            </div>

            <div className="mt-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={formData.isActive}
                  onChange={(e) =>
                    setFormData({ ...formData, isActive: e.target.checked })
                  }
                  className="w-4 h-4 text-primary rounded"
                />
                <span className="text-sm text-gray-600">上架状态</span>
              </label>
            </div>
          </div>

          {/* 提交按钮 */}
          <div className="flex gap-4">
            <Link
              href="/admin/products"
              className="flex-1 py-3 text-center border rounded-lg text-gray-600 hover:bg-gray-50"
            >
              取消
            </Link>
            <button
              type="submit"
              disabled={saving}
              className="flex-1 py-3 bg-primary text-white rounded-lg font-semibold hover:bg-primary/90 disabled:opacity-50"
            >
              {saving ? "保存中..." : "保存修改"}
            </button>
          </div>
        </form>
      </>
  );
}
