"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

interface PaymentMethod {
  value: string;
  label: string;
  icon: string;
}

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
  const [paymentMethod, setPaymentMethod] = useState("");
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();

  // 获取启用的支付方式
  useEffect(() => {
    fetch("/api/settings/payment-methods")
      .then((res) => res.json())
      .then((data) => {
        setPaymentMethods(data.methods || []);
        // 默认选中第一个支付方式
        if (data.methods?.length > 0) {
          setPaymentMethod(data.methods[0].value);
        }
      })
      .catch(() => {
        // 失败时使用默认支付方式
        const defaultMethods = [
          { value: "WECHAT", label: "微信", icon: "💚" },
          { value: "ALIPAY", label: "支付宝", icon: "💳" },
          { value: "USDT_TRC20", label: "USDT", icon: "💰" },
          { value: "BALANCE", label: "余额", icon: "💵" },
        ];
        setPaymentMethods(defaultMethods);
        setPaymentMethod("WECHAT");
      });
  }, []);

  const handleBuyNow = async () => {
    if (!email) {
      setError("请填写邮箱，用于接收卡密");
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
      if (data.qrCode) {
        // 跳转到我们自己的支付页面（带倒计时）
        const payUrl = `/pay/${data.orderNo}?password=${data.queryPassword}&qrcode=${encodeURIComponent(data.qrCode)}&amount=${product.price * quantity}&method=${paymentMethod}`;
        router.push(payUrl);
      } else if (data.payUrl) {
        // 没有二维码时直接跳转第三方
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

      {/* 支付方式 */}
      <div>
        <label className="block text-sm text-gray-600 mb-2">支付方式</label>
        <div className="grid grid-cols-2 gap-2">
          {paymentMethods.map((method) => (
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
        disabled={loading || disabled}
        className="w-full py-3 mt-4 bg-primary text-white rounded-lg font-semibold hover:bg-primary/90 disabled:opacity-50"
      >
        {loading ? "提交中..." : `立即支付 ¥${((product.price * quantity) / 100).toFixed(2)}`}
      </button>
    </div>
  );
}
