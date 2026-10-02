"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { HeaderClient as Header } from "@/components/shop/header-client";
import { useCartStore } from "@/stores/cart";

interface PaymentMethod {
  value: string;
  label: string;
  icon: string;
}

export default function CheckoutPage() {
  const router = useRouter();
  const { items, getTotalAmount, clearCart, removeItem, updateQuantity } =
    useCartStore();
  const [email, setEmail] = useState("");
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);
  const [paymentMethod, setPaymentMethod] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // 获取支付方式
  useEffect(() => {
    fetch("/api/settings/payment-methods")
      .then((res) => res.json())
      .then((data) => {
        const methods = data.methods || [];
        setPaymentMethods(methods);
        if (methods.length > 0) {
          setPaymentMethod(methods[0].value);
        }
      })
      .catch(() => {
        setPaymentMethods([]);
        setPaymentMethod("");
        setError("支付方式暂不可用，请稍后重试");
      });
  }, []);

  const totalAmount = getTotalAmount();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!email) {
      setError("请填写邮箱，用于接收卡密");
      return;
    }

    if (items.length === 0) {
      setError("购物车为空");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const response = await fetch("/api/orders", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          items: items.map((item) => ({
            productId: item.productId,
            quantity: item.quantity,
          })),
          email: email || undefined,
          paymentMethod,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "创建订单失败");
      }

      // 清空购物车
      clearCart();

      // 跳转到支付页面
      if (data.orderNo && data.queryPassword) sessionStorage.setItem(`order-password:${data.orderNo}`, data.queryPassword);

      if (data.payUrl) {
        // USDT 支付跳转到内部支付页
        if (paymentMethod.startsWith("USDT")) {
          const params = new URLSearchParams({
            password: data.queryPassword,
            qrcode: data.qrCode || "",
            amount: String(totalAmount),
            method: paymentMethod,
            usdt: String(data.usdtAmount || ""),
            rate: String(data.exchangeRate || ""),
          });
          router.push(`/pay/${data.orderNo}?${params.toString()}`);
        } else {
          window.location.href = data.payUrl;
        }
      } else {
        router.push(`/order/${data.orderNo}?password=${data.queryPassword}`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "创建订单失败");
    } finally {
      setLoading(false);
    }
  };

  if (items.length === 0) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="text-6xl mb-4">🛒</div>
          <h1 className="text-2xl font-bold text-gray-800 mb-4">购物车是空的</h1>
          <Link href="/" className="text-primary hover:underline">
            去逛逛 →
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Header />

      <main className="container mx-auto px-4 py-8">
        <h1 className="text-2xl font-bold text-gray-800 mb-8">确认订单</h1>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* 商品列表 */}
          <div className="lg:col-span-2 space-y-4">
            {items.map((item) => (
              <div
                key={item.productId}
                className="bg-white rounded-xl p-4 flex flex-col sm:flex-row items-start sm:items-center gap-4"
              >
                <div className="w-16 h-16 sm:w-20 sm:h-20 bg-gradient-to-br from-blue-500 to-purple-600 rounded-lg flex items-center justify-center flex-shrink-0">
                  <span className="text-xl sm:text-2xl text-white">🤖</span>
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-gray-800 truncate">
                    {item.productName}
                  </h3>
                  <p className="text-red-500 font-bold">
                    ¥{(item.price / 100).toFixed(2)}
                  </p>
                </div>
                <div className="flex items-center justify-between w-full sm:w-auto gap-4">
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() =>
                        updateQuantity(item.productId, item.quantity - 1)
                      }
                      className="w-8 h-8 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center"
                    >
                      -
                    </button>
                    <span className="w-8 text-center">{item.quantity}</span>
                    <button
                      onClick={() =>
                        updateQuantity(item.productId, item.quantity + 1)
                      }
                      className="w-8 h-8 rounded-full bg-gray-100 hover:bg-gray-200 flex items-center justify-center"
                    >
                      +
                    </button>
                  </div>
                  <button
                    onClick={() => removeItem(item.productId)}
                    className="text-gray-400 hover:text-red-500"
                  >
                    删除
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* 订单信息 */}
          <div className="lg:col-span-1">
            <form onSubmit={handleSubmit} className="bg-white rounded-xl p-6">
              <h2 className="text-lg font-bold text-gray-800 mb-4">
                订单信息
              </h2>

              {error && (
                <div className="mb-4 p-3 bg-red-50 text-red-600 rounded-lg text-sm">
                  {error}
                </div>
              )}

              {/* 联系方式 */}
              <div className="space-y-4 mb-6">
                <div>
                  <label className="block text-sm text-gray-600 mb-1">
                    邮箱 (接收卡密)
                  </label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="user@example.com"
                    className="w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50"
                  />
                </div>
              </div>

              {/* 支付方式 */}
              <div className="mb-6">
                <label className="block text-sm text-gray-600 mb-2">
                  支付方式
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {paymentMethods.map((method) => (
                    <button
                      key={method.value}
                      type="button"
                      onClick={() => setPaymentMethod(method.value)}
                      className={`p-3 border rounded-lg text-sm flex items-center gap-2 ${
                        paymentMethod === method.value
                          ? "border-primary bg-primary/5"
                          : "hover:bg-gray-50"
                      }`}
                    >
                      {method.value === "USDT_TRC20" ? (
                        <span className="w-5 h-5 rounded-full flex items-center justify-center text-white text-xs font-bold" style={{ backgroundColor: "#26A17B" }}>₮</span>
                      ) : method.value === "WECHAT" ? (
                        <img src="/icons/wechat.png" alt="微信" className="w-5 h-5 object-contain shrink-0" />
                      ) : method.value === "ALIPAY" ? (
                        <img src="/icons/alipay.png" alt="支付宝" className="w-5 h-5 object-contain shrink-0" />
                      ) : (
                        <span>{method.icon}</span>
                      )}
                      <span>{method.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* 金额 */}
              <div className="border-t pt-4 mb-6">
                <div className="flex justify-between text-gray-600 mb-2">
                  <span>商品总价</span>
                  <span>¥{(totalAmount / 100).toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-lg font-bold">
                  <span>应付金额</span>
                  <span className="text-red-500">
                    ¥{(totalAmount / 100).toFixed(2)}
                  </span>
                </div>
              </div>

              {/* 提交按钮 */}
              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 bg-primary text-white rounded-lg font-semibold hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? "处理中..." : "提交订单"}
              </button>

              <p className="text-xs text-gray-500 mt-4 text-center">
                提交订单即表示您同意我们的服务条款
              </p>
            </form>
          </div>
        </div>
      </main>
    </div>
  );
}
