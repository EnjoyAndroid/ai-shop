"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { PasswordInput } from "@/components/ui/password-input";
import { createOrderSchema } from "@/lib/validations";
import { saveOrderAccess } from "@/lib/order-client";

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
  const [quantity, setQuantity] = useState(product.minQuantity);
  const [email, setEmail] = useState("");
  const [queryPassword, setQueryPassword] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("");
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [showBalanceConfirm, setShowBalanceConfirm] = useState(false);
  const [userBalance, setUserBalance] = useState<number | null>(null);
  const router = useRouter();

  const totalAmount = product.price * quantity;

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
        setPaymentMethods([]);
        setPaymentMethod("");
      });
  }, []);

  // 检查余额
  const checkBalance = async () => {
    try {
      const res = await fetch("/api/user/balance");
      if (res.ok) {
        const data = await res.json();
        return data.balance || 0;
      }
      return null;
    } catch {
      return null;
    }
  };

  const handleBuyNow = async () => {
    const validation = createOrderSchema.safeParse({ productId: product.productId, quantity, email, paymentMethod, queryPassword });
    if (!validation.success) {
      setError(validation.error.issues[0].message);
      return;
    }

    // 余额支付：先检查余额，显示确认弹框
    if (paymentMethod === "BALANCE") {
      setLoading(true);
      setError("");
      const balance = await checkBalance();
      setLoading(false);

      if (balance === null) {
        setError("请先登录后使用余额支付");
        return;
      }

      setUserBalance(balance);

      if (balance < totalAmount) {
        setError(`余额不足，当前余额 ¥${(balance / 100).toFixed(2)}，需要 ¥${(totalAmount / 100).toFixed(2)}`);
        return;
      }

      // 显示确认弹框
      setShowBalanceConfirm(true);
      return;
    }

    // 其他支付方式走原有流程
    await submitOrder();
  };

  // 确认余额支付
  const handleConfirmBalancePay = async () => {
    setShowBalanceConfirm(false);
    await submitOrder();
  };

  // 提交订单
  const submitOrder = async () => {
    setLoading(true);
    setError("");

    try {
      const response = await fetch("/api/orders", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          productId: product.productId,
          quantity,
          email,
          queryPassword,
          paymentMethod,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "创建订单失败");
      }

      saveOrderAccess(data.orderNo, data.accessToken);
      setQueryPassword("");
      if (paymentMethod === "BALANCE") {
        router.push(`/order/${data.orderNo}`);
      } else if (data.qrCode) {
        router.push(`/pay/${data.orderNo}`);
      } else if (data.payUrl) {
        window.location.href = data.payUrl;
      } else {
        router.push(`/order/${data.orderNo}`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "创建订单失败");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* 余额支付确认弹框 */}
      {showBalanceConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl p-6 max-w-sm w-full">
            <h3 className="text-lg font-bold text-gray-800 mb-4">确认支付</h3>
            <div className="space-y-3 mb-6">
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">商品</span>
                <span className="text-gray-800">{product.productName}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">数量</span>
                <span className="text-gray-800">{quantity}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">当前余额</span>
                <span className="text-gray-800">¥{((userBalance || 0) / 100).toFixed(2)}</span>
              </div>
              <div className="flex justify-between font-bold pt-3 border-t">
                <span>支付金额</span>
                <span className="text-red-500">¥{(totalAmount / 100).toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">支付后余额</span>
                <span className="text-green-600">¥{(((userBalance || 0) - totalAmount) / 100).toFixed(2)}</span>
              </div>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setShowBalanceConfirm(false)}
                className="flex-1 py-2 border border-gray-300 text-gray-600 rounded-lg hover:bg-gray-50"
              >
                取消
              </button>
              <button
                onClick={handleConfirmBalancePay}
                disabled={loading}
                className="flex-1 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 disabled:opacity-50"
              >
                {loading ? "支付中..." : "确认支付"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 数量选择 */}
      <div className="flex flex-wrap items-center gap-3 sm:gap-4">
        <span className="text-gray-600">数量:</span>
        <div className="flex items-center border rounded-lg">
          <button
            onClick={() => setQuantity(Math.max(product.minQuantity, quantity - 1))}
            className="px-3 sm:px-4 py-2 text-gray-600 hover:bg-gray-100"
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
            className="w-12 sm:w-16 text-center border-x py-2"
            min={product.minQuantity}
            max={product.maxQuantity}
            disabled={disabled}
          />
          <button
            onClick={() =>
              setQuantity(Math.min(product.maxQuantity, quantity + 1))
            }
            className="px-3 sm:px-4 py-2 text-gray-600 hover:bg-gray-100"
            disabled={disabled}
          >
            +
          </button>
        </div>
        <span className="text-gray-500 text-sm w-full sm:w-auto mt-1 sm:mt-0">
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
        <label htmlFor="order-contact-email" className="block text-sm text-gray-600 mb-1">
          邮箱 <span className="text-red-500">*</span>
        </label>
        <input
          id="order-contact-email"
          name="orderContactEmail"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="请输入邮箱"
          autoComplete="off"
          className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50 text-sm"
        />
      </div>

      <div>
        <label htmlFor="order-query-code" className="block text-sm text-gray-600 mb-1">
          订单查询密码 <span className="text-red-500">*</span>
        </label>
        <PasswordInput id="order-query-code" name="orderLookupCode" value={queryPassword}
          onChange={event => setQueryPassword(event.target.value)} required minLength={8} avoidPasswordManager
          placeholder="请设置至少8位的查询密码"
          className="px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50 text-sm" />
        <p className="text-xs text-gray-500 mt-2">请妥善保存，用于查询订单详情和领取卡密。密码不会通过邮件发送。</p>
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
              {method.value === "USDT_TRC20" ? (
                <span className="w-4 h-4 rounded-full flex items-center justify-center text-white text-xs font-bold" style={{ backgroundColor: "#26A17B" }}>₮</span>
              ) : method.value === "WECHAT" ? (
                <img src="/icons/wechat.png" alt="微信" className="w-4 h-4 object-contain shrink-0" />
              ) : method.value === "ALIPAY" ? (
                <img src="/icons/alipay.png" alt="支付宝" className="w-4 h-4 object-contain shrink-0" />
              ) : (
                <span>{method.icon}</span>
              )}
              <span>{method.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* 提交按钮 */}
      <button
        onClick={handleBuyNow}
        disabled={loading || disabled || !paymentMethod}
        className="w-full py-3 mt-4 bg-primary text-white rounded-lg font-semibold hover:bg-primary/90 disabled:opacity-50"
      >
        {loading ? "提交中..." : `立即支付 ¥${((product.price * quantity) / 100).toFixed(2)}`}
      </button>
    </div>
  );
}
