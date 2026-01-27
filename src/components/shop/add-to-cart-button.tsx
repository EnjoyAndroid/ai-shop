"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useCartStore } from "@/stores/cart";

interface AddToCartButtonProps {
  product: {
    productId: string;
    productName: string;
    price: number;
    maxQuantity: number;
  };
  disabled?: boolean;
}

export function AddToCartButton({ product, disabled }: AddToCartButtonProps) {
  const [quantity, setQuantity] = useState(1);
  const router = useRouter();
  const addItem = useCartStore((state) => state.addItem);

  const handleAddToCart = () => {
    addItem({
      ...product,
      quantity,
    });
    // 提示成功
    alert("已添加到购物车");
  };

  const handleBuyNow = () => {
    addItem({
      ...product,
      quantity,
    });
    router.push("/checkout");
  };

  return (
    <div className="space-y-4">
      {/* 数量选择 */}
      <div className="flex items-center gap-4">
        <span className="text-gray-600">数量:</span>
        <div className="flex items-center border rounded-lg">
          <button
            onClick={() => setQuantity(Math.max(1, quantity - 1))}
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
                  Math.max(1, parseInt(e.target.value) || 1)
                )
              )
            }
            className="w-16 text-center border-x py-2"
            min={1}
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
      </div>

      {/* 按钮组 */}
      <div className="flex gap-4">
        <button
          onClick={handleAddToCart}
          disabled={disabled}
          className="flex-1 py-3 px-6 border-2 border-primary text-primary rounded-lg font-semibold hover:bg-primary/5 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          加入购物车
        </button>
        <button
          onClick={handleBuyNow}
          disabled={disabled}
          className="flex-1 py-3 px-6 bg-primary text-white rounded-lg font-semibold hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          立即购买
        </button>
      </div>
    </div>
  );
}
