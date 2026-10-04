"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

interface PaymentMethod {
  value: string;
  label: string;
  icon: string;
}

const RECHARGE_AMOUNTS = [
  { value: 1000, label: "10" },
  { value: 2000, label: "20" },
  { value: 5000, label: "50" },
  { value: 10000, label: "100" },
  { value: 20000, label: "200" },
  { value: 50000, label: "500" },
];

export default function RechargePage() {
  const router = useRouter();
  const [amount, setAmount] = useState(5000); // 默认50元
  const [customAmount, setCustomAmount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("");
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // 获取支付方式
  useEffect(() => {
    fetch("/api/settings/payment-methods")
      .then((res) => res.json())
      .then((data) => {
        // 排除余额支付
        const methods = (data.methods || []).filter(
          (m: PaymentMethod) => m.value !== "BALANCE"
        );
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

  const handleSelectAmount = (value: number) => {
    setAmount(value);
    setCustomAmount("");
  };

  const handleCustomAmount = (value: string) => {
    setCustomAmount(value);
    const parsed = parseFloat(value);
    if (!isNaN(parsed) && parsed > 0) {
      setAmount(Math.round(parsed * 100));
    }
  };

  const handleSubmit = async () => {
    if (amount < 100) {
      setError("充值金额不能小于 1 元");
      return;
    }

    if (!paymentMethod) {
      setError("请选择支付方式");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const response = await fetch("/api/recharge", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          amount,
          paymentMethod,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "创建充值订单失败");
      }

      // 跳转到支付页面
      if (data.qrCode) {
        router.push(`/pay/${data.orderNo}`);
      } else if (data.payUrl) {
        window.location.href = data.payUrl;
      } else {
        router.push(`/order/${data.orderNo}`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "创建充值订单失败");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto">
          {/* 返回链接 */}
          <Link
            href="/balance"
            className="inline-flex items-center text-gray-600 hover:text-primary mb-6"
          >
            ← 返回我的余额
          </Link>

          <div className="bg-white rounded-xl p-8">
            <h1 className="text-2xl font-bold text-gray-800 mb-8">余额充值</h1>

            {error && (
              <div className="mb-6 p-4 bg-red-50 text-red-600 rounded-lg">
                {error}
              </div>
            )}

            {/* 充值金额选择 */}
            <div className="mb-8">
              <label className="block text-sm font-medium text-gray-700 mb-4">
                选择充值金额
              </label>
              <div className="grid grid-cols-3 gap-4">
                {RECHARGE_AMOUNTS.map((item) => (
                  <button
                    key={item.value}
                    type="button"
                    onClick={() => handleSelectAmount(item.value)}
                    className={`py-4 border-2 rounded-xl text-center transition-colors ${
                      amount === item.value && !customAmount
                        ? "border-primary bg-primary/5 text-primary"
                        : "border-gray-200 hover:border-gray-300"
                    }`}
                  >
                    <span className="text-2xl font-bold">¥{item.label}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* 自定义金额 */}
            <div className="mb-8">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                自定义金额
              </label>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500 text-lg">
                  ¥
                </span>
                <input
                  type="number"
                  value={customAmount}
                  onChange={(e) => handleCustomAmount(e.target.value)}
                  placeholder="输入其他金额"
                  className="w-full pl-10 pr-4 py-3 border-2 rounded-xl focus:outline-none focus:border-primary"
                  min="1"
                  step="0.01"
                />
              </div>
              <p className="text-sm text-gray-500 mt-2">最低充值 1 元</p>
            </div>

            {/* 支付方式 */}
            <div className="mb-8">
              <label className="block text-sm font-medium text-gray-700 mb-4">
                支付方式
              </label>
              <div className="grid grid-cols-2 gap-4">
                {paymentMethods.map((method) => (
                  <button
                    key={method.value}
                    type="button"
                    onClick={() => setPaymentMethod(method.value)}
                    className={`p-4 border-2 rounded-xl flex items-center gap-3 transition-colors ${
                      paymentMethod === method.value
                        ? "border-primary bg-primary/5"
                        : "border-gray-200 hover:border-gray-300"
                    }`}
                  >
                    {method.value === "USDT_TRC20" ? (
                      <span
                        className="w-6 h-6 rounded-full flex items-center justify-center text-white text-sm font-bold"
                        style={{ backgroundColor: "#26A17B" }}
                      >
                        ₮
                      </span>
                    ) : method.value === "WECHAT" ? (
                      <img src="/icons/wechat.png" alt="微信" className="w-6 h-6 object-contain shrink-0" />
                    ) : method.value === "ALIPAY" ? (
                      <img src="/icons/alipay.png" alt="支付宝" className="w-6 h-6 object-contain shrink-0" />
                    ) : (
                      <span className="text-2xl">{method.icon}</span>
                    )}
                    <span className="font-medium">{method.label}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* 充值金额汇总 */}
            <div className="bg-gray-50 rounded-xl p-6 mb-8">
              <div className="flex items-center justify-between">
                <span className="text-gray-600">充值金额</span>
                <span className="text-2xl font-bold text-primary">
                  ¥{(amount / 100).toFixed(2)}
                </span>
              </div>
            </div>

            {/* 提交按钮 */}
            <button
              onClick={handleSubmit}
              disabled={loading}
              className="w-full py-4 bg-primary text-white rounded-xl font-semibold text-lg hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? "处理中..." : `确认充值 ¥${(amount / 100).toFixed(2)}`}
            </button>

            <p className="text-center text-sm text-gray-500 mt-4">
              充值成功后余额将自动到账
            </p>
          </div>
    </div>
  );
}
