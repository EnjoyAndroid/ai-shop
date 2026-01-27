"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface BuyNowButtonProps {
  product: {
    productId: string;
    productName: string;
    price: number;
    maxQuantity: number;
    minQuantity: number;
  };
  disabled?: boolean;
}

export function BuyNowButton({ product, disabled }: BuyNowButtonProps) {
  const [quantity, setQuantity] = useState(1);
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("ALIPAY");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [showForm, setShowForm] = useState(false);
  const router = useRouter();

  const handleBuyNow = async () => {
    if (!email && !phone) {
      setError("请填写邮箱或手机号，用于接收卡密");
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
          items: [
            {
              productId: product.productId,
              quantity,
            },
          ],
          email: email || undefined,
          phone: phone || undefined,
          paymentMethod,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "创建订单失败");
      }

      // 跳转到支付页面或订单详情
      if (data.payUrl) {
        window.location.href = data.payUrl;
      } else {
        router.push(`/order/${data.orderNo}?password=${data.queryPassword}`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "创建订单失败");
    } finally {
      setLoading(false);
    }
  };

  if (!showForm) {
    return (
      <div className="space-y-4">
        {/* 数量选择 */}
        <div className="flex items-center gap-4">
          <span className="text-gray-600">数量:</span>
          <div className="flex items-center border rounded-lg">
            <button
              onClick={() => setQuantity(Math.max(product.minQuantity, quantity - 1))}
              className="px-4 py-2 text-gray-600 hover:bg-gray-100"
              disabled={disabled}
            >
              -
            </button>
            <input
              type="number"
              value={quantity}
              onChange={(e) =>
                setQuantity(
                  Math.min(
                    product.maxQuantity,
                    Math.max(product.minQuantity, parseInt(e.target.value) || product.minQuantity)
                  )
                )
              }
              className="w-16 text-center border-x py-2"
              min={product.minQuantity}
              max={product.maxQuantity}
              disabled={disabled}
            />
            <button
              onClick={() =>
                setQuantity(Math.min(product.maxQuantity, quantity + 1))
              }
              className="px-4 py-2 text-gray-600 hover:bg-gray-100"
              disabled={disabled}
            >
              +
            </button>
          </div>
          <span className="text-gray-500 text-sm">
            小计: <span className="text-red-500 font-bold">¥{((product.price * quantity) / 100).toFixed(2)}</span>
          </span>
        </div>

        {/* 立即购买按钮 */}
        <button
          onClick={() => setShowForm(true)}
          disabled={disabled}
          className="w-full py-3 px-6 bg-primary text-white rounded-lg font-semibold hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          立即购买
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4 p-4 bg-gray-50 rounded-lg">
      <div className="flex items-center justify-between mb-2">
        <h3 className="font-semibold text-gray-800">确认订单</h3>
        <button
          onClick={() => setShowForm(false)}
          className="text-gray-400 hover:text-gray-600"
        >
          ✕
        </button>
      </div>

      {/* 订单信息 */}
      <div className="p-3 bg-white rounded-lg text-sm">
        <div className="flex justify-between">
          <span className="text-gray-600">{product.productName}</span>
          <span>×{quantity}</span>
        </div>
        <div className="flex justify-between mt-2 font-bold">
          <span>合计</span>
          <span className="text-red-500">¥{((product.price * quantity) / 100).toFixed(2)}</span>
        </div>
      </div>

      {error && (
        <div className="p-3 bg-red-50 text-red-600 rounded-lg text-sm">
          {error}
        </div>
      )}

      {/* 联系方式 */}
      <div>
        <label className="block text-sm text-gray-600 mb-1">
          邮箱 <span className="text-red-500">*</span>
        </label>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="接收卡密的邮箱"
          className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50 text-sm"
        />
      </div>

      <div>
        <label className="block text-sm text-gray-600 mb-1">
          手机号 <span className="text-gray-400">(可选)</span>
        </label>
        <input
          type="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="备用联系方式"
          className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50 text-sm"
        />
      </div>

      {/* 支付方式 */}
      <div>
        <label className="block text-sm text-gray-600 mb-2">支付方式</label>
        <div className="grid grid-cols-2 gap-2">
          {[
            { value: "ALIPAY", label: "支付宝", icon: "💳" },
            { value: "WECHAT", label: "微信", icon: "💚" },
            { value: "USDT_TRC20", label: "USDT", icon: "💰" },
            { value: "BALANCE", label: "余额", icon: "💵" },
          ].map((method) => (
            <button
              key={method.value}
              type="button"
              onClick={() => setPaymentMethod(method.value)}
              className={`p-2 border rounded-lg text-sm flex items-center justify-center gap-1 ${
                paymentMethod === method.value
                  ? "border-primary bg-primary/5 text-primary"
                  : "hover:bg-gray-50"
              }`}
            >
              <span>{method.icon}</span>
              <span>{method.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* 提交按钮 */}
      <button
        onClick={handleBuyNow}
        disabled={loading}
        className="w-full py-3 bg-primary text-white rounded-lg font-semibold hover:bg-primary/90 disabled:opacity-50"
      >
        {loading ? "提交中..." : `确认支付 ¥${((product.price * quantity) / 100).toFixed(2)}`}
      </button>

      <p className="text-xs text-gray-500 text-center">
        支付成功后卡密将自动发送到您的邮箱
      </p>
    </div>
  );
}
