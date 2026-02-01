import prisma from "@/lib/db";
import { generateOrderNo, generatePassword } from "@/lib/encryption";
import { allocateCardKeys, decryptCardKey } from "./product.service";
import { getOrderExpireMinutes, getOrderAutoDeleteDays } from "./settings.service";
import { sendPaymentSuccessEmail } from "@/lib/mail";
import { sendPaymentSuccessTelegram } from "@/lib/telegram";
import redis, { CACHE_KEYS } from "@/lib/redis";
import type { Order, OrderItem, CardKey, PaymentMethod, OrderStatus } from "@prisma/client";

export interface OrderWithItems extends Order {
  items: (OrderItem & {
    cardKeys: CardKey[];
    product: {
      id: string;
      name: string;
      slug: string;
    };
  })[];
}

export interface CreateOrderParams {
  userId?: string;
  email?: string;
  phone?: string;
  paymentMethod: PaymentMethod;
  items: {
    productId: string;
    quantity: number;
  }[];
  ip?: string;
  userAgent?: string;
  fingerprint?: string;
}

/**
 * 创建订单（使用事务锁定卡密）
 */
export async function createOrder(params: CreateOrderParams): Promise<Order> {
  const { userId, email, phone, paymentMethod, items, ip, userAgent, fingerprint } = params;

  // 获取商品信息和价格
  const productIds = items.map((item) => item.productId);
  const products = await prisma.product.findMany({
    where: {
      id: { in: productIds },
      isActive: true,
    },
    include: {
      _count: {
        select: {
          cardKeys: {
            where: { status: "AVAILABLE" },
          },
        },
      },
    },
  });

  // 验证商品和库存
  const productMap = new Map(products.map((p) => [p.id, p]));
  let totalAmount = 0;

  for (const item of items) {
    const product = productMap.get(item.productId);
    if (!product) {
      throw new Error(`商品不存在: ${item.productId}`);
    }
    if (product._count.cardKeys < item.quantity) {
      throw new Error(`${product.name} 库存不足`);
    }
    if (item.quantity < product.minQuantity || item.quantity > product.maxQuantity) {
      throw new Error(`${product.name} 购买数量需在 ${product.minQuantity}-${product.maxQuantity} 之间`);
    }
    totalAmount += product.price * item.quantity;
  }

  // 计算折扣 (如果是会员)
  let discountAmount = 0;
  if (userId) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { level: true },
    });
    if (user?.level) {
      discountAmount = Math.floor(totalAmount * (100 - user.level.discount) / 100);
    }
  }

  const payAmount = totalAmount - discountAmount;

  // 生成订单号和查询密码
  const orderNo = generateOrderNo();
  const queryPassword = generatePassword();

  // 从配置获取订单过期时间
  const expireMinutes = await getOrderExpireMinutes();
  const expiredAt = new Date(Date.now() + expireMinutes * 60 * 1000);

  // 使用事务创建订单并锁定卡密
  const order = await prisma.$transaction(async (tx) => {
    // 创建订单
    const newOrder = await tx.order.create({
      data: {
        orderNo,
        userId,
        email,
        phone,
        queryPassword,
        totalAmount,
        discountAmount,
        payAmount,
        paymentMethod,
        status: "PENDING",
        ip,
        userAgent,
        fingerprint,
        expiredAt,
        items: {
          create: items.map((item) => {
            const product = productMap.get(item.productId)!;
            return {
              productId: item.productId,
              productName: product.name,
              price: product.price,
              quantity: item.quantity,
            };
          }),
        },
      },
      include: {
        items: true,
      },
    });

    // 为每个订单项锁定对应数量的卡密
    for (const orderItem of newOrder.items) {
      // 查询 AVAILABLE 状态的卡密
      const availableCardKeys = await tx.cardKey.findMany({
        where: {
          productId: orderItem.productId,
          status: "AVAILABLE",
        },
        take: orderItem.quantity,
        orderBy: { createdAt: "asc" },
      });

      // 检查库存是否足够
      if (availableCardKeys.length < orderItem.quantity) {
        const product = productMap.get(orderItem.productId);
        throw new Error(`${product?.name || "商品"} 库存不足`);
      }

      // 将卡密状态更新为 LOCKED，关联 orderItemId
      await tx.cardKey.updateMany({
        where: {
          id: { in: availableCardKeys.map((k) => k.id) },
        },
        data: {
          status: "LOCKED",
          orderId: orderItem.id,
        },
      });
    }

    return newOrder;
  });

  // 清除商品缓存，确保库存显示正确
  for (const product of products) {
    await redis.del(CACHE_KEYS.PRODUCT(product.slug));
  }

  return order;
}

/**
 * 支付成功处理
 */
export async function handlePaymentSuccess(
  orderNo: string,
  paymentNo: string
): Promise<OrderWithItems> {
  // 使用分布式锁防止重复处理
  const lockKey = CACHE_KEYS.ORDER_LOCK(orderNo);
  const lockValue = Date.now().toString();

  const acquired = await redis.set(lockKey, lockValue, "EX", 60, "NX");
  if (!acquired) {
    throw new Error("订单正在处理中");
  }

  try {
    // 查询订单
    const order = await prisma.order.findUnique({
      where: { orderNo },
      include: {
        items: {
          include: {
            product: {
              select: { id: true, name: true, slug: true },
            },
          },
        },
      },
    });

    if (!order) {
      throw new Error("订单不存在");
    }

    if (order.status !== "PENDING") {
      // 已处理过，直接返回
      return order as OrderWithItems;
    }

    // 判断是否为充值订单（订单号以 R 开头或没有商品项）
    const isRechargeOrder = orderNo.startsWith("R") || order.items.length === 0;

    if (isRechargeOrder) {
      // 充值订单：增加用户余额
      if (order.userId) {
        await prisma.user.update({
          where: { id: order.userId },
          data: {
            balance: { increment: order.payAmount },
          },
        });

        // 记录余额变动
        const user = await prisma.user.findUnique({
          where: { id: order.userId },
          select: { balance: true },
        });

        await prisma.balanceLog.create({
          data: {
            userId: order.userId,
            type: "RECHARGE",
            amount: order.payAmount,
            balance: user?.balance || 0,
            orderId: order.id,
            remark: `充值 ¥${(order.payAmount / 100).toFixed(2)}`,
          },
        });
      }

      // 更新订单状态
      const updatedOrder = await prisma.order.update({
        where: { id: order.id },
        data: {
          status: "COMPLETED",
          paymentNo,
          paidAt: new Date(),
        },
        include: {
          items: {
            include: {
              cardKeys: true,
              product: {
                select: { id: true, name: true, slug: true },
              },
            },
          },
        },
      });

      return updatedOrder as OrderWithItems;
    }

    // 商品订单：分配卡密
    for (const item of order.items) {
      await allocateCardKeys(item.productId, item.quantity, item.id);
    }

    // 更新订单状态
    const updatedOrder = await prisma.order.update({
      where: { id: order.id },
      data: {
        status: "DELIVERED",
        paymentNo,
        paidAt: new Date(),
      },
      include: {
        items: {
          include: {
            cardKeys: true,
            product: {
              select: { id: true, name: true, slug: true },
            },
          },
        },
      },
    });

    // 更新用户消费累计和等级
    if (order.userId) {
      await updateUserSpent(order.userId, order.payAmount);
    }

    // 发送支付成功邮件
    if (order.email) {
      const emailItems = updatedOrder.items.map((item) => ({
        productName: item.productName,
        cardKeys: item.cardKeys.map((ck) => decryptCardKey(ck)),
      }));

      sendPaymentSuccessEmail({
        to: order.email,
        orderNo: order.orderNo,
        queryPassword: order.queryPassword || "",
        items: emailItems,
        totalAmount: order.payAmount,
      }).catch((err) => {
        console.error("Failed to send payment email:", err);
      });
    }

    // 发送 Telegram 通知
    sendPaymentSuccessTelegram({
      orderNo: order.orderNo,
      email: order.email || "",
      phone: order.phone || undefined,
      payAmount: order.payAmount,
      paymentMethod: order.paymentMethod || "BALANCE",
      items: updatedOrder.items.map((item) => ({
        productName: item.productName,
        quantity: item.quantity,
        price: item.price,
      })),
    }).catch((err) => {
      console.error("Failed to send Telegram notification:", err);
    });

    return updatedOrder as OrderWithItems;
  } finally {
    await redis.del(lockKey);
  }
}

/**
 * 更新用户累计消费并检查升级
 */
async function updateUserSpent(userId: string, amount: number): Promise<void> {
  const user = await prisma.user.update({
    where: { id: userId },
    data: {
      totalSpent: { increment: amount },
    },
  });

  // 检查是否需要升级
  const newLevel = await prisma.userLevel.findFirst({
    where: {
      minSpent: { lte: user.totalSpent },
    },
    orderBy: { minSpent: "desc" },
  });

  if (newLevel && newLevel.id !== user.levelId) {
    await prisma.user.update({
      where: { id: userId },
      data: { levelId: newLevel.id },
    });
  }
}

/**
 * 查询订单
 */
export async function getOrderByNo(
  orderNo: string,
  queryPassword?: string
): Promise<OrderWithItems | null> {
  const order = await prisma.order.findUnique({
    where: { orderNo },
    include: {
      items: {
        include: {
          cardKeys: true,
          product: {
            select: { id: true, name: true, slug: true },
          },
        },
      },
    },
  });

  if (!order) {
    return null;
  }

  // 验证查询密码 (游客订单需要)
  if (!order.userId && order.queryPassword !== queryPassword) {
    throw new Error("查询密码错误");
  }

  return order as OrderWithItems;
}

/**
 * 获取用户订单列表
 */
export async function getUserOrders(
  userId: string,
  options: { page?: number; limit?: number; status?: OrderStatus } = {}
): Promise<{ orders: Order[]; total: number }> {
  const { page = 1, limit = 10, status } = options;

  const where = {
    userId,
    ...(status && { status }),
  };

  const [orders, total] = await Promise.all([
    prisma.order.findMany({
      where,
      include: {
        items: {
          include: {
            product: {
              select: { id: true, name: true, slug: true },
            },
          },
        },
      },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.order.count({ where }),
  ]);

  return { orders, total };
}

/**
 * 获取订单卡密 (解密后)
 */
export function getOrderCardKeys(order: OrderWithItems): {
  productName: string;
  cardKeys: string[];
}[] {
  return order.items.map((item) => ({
    productName: item.productName,
    cardKeys: item.cardKeys.map((ck) => decryptCardKey(ck)),
  }));
}

/**
 * 取消过期订单（释放锁定的卡密）
 */
export async function cancelExpiredOrders(): Promise<number> {
  // 查询过期的 PENDING 订单
  const expiredOrders = await prisma.order.findMany({
    where: {
      status: "PENDING",
      expiredAt: { lt: new Date() },
    },
    include: {
      items: true,
    },
  });

  if (expiredOrders.length === 0) {
    return 0;
  }

  // 使用事务释放卡密并取消订单
  await prisma.$transaction(async (tx) => {
    // 获取所有订单项 ID
    const orderItemIds = expiredOrders.flatMap((order) =>
      order.items.map((item) => item.id)
    );

    // 释放锁定的卡密：将 LOCKED 状态改为 AVAILABLE，清除 orderId
    await tx.cardKey.updateMany({
      where: {
        orderId: { in: orderItemIds },
        status: "LOCKED",
      },
      data: {
        status: "AVAILABLE",
        orderId: null,
      },
    });

    // 更新订单状态为 CANCELLED
    await tx.order.updateMany({
      where: {
        id: { in: expiredOrders.map((o) => o.id) },
      },
      data: {
        status: "CANCELLED",
      },
    });
  });

  // 清除相关商品缓存，确保库存显示正确
  const productIds = Array.from(new Set(expiredOrders.flatMap((order) =>
    order.items.map((item) => item.productId)
  )));

  const products = await prisma.product.findMany({
    where: { id: { in: productIds } },
    select: { slug: true },
  });

  for (const product of products) {
    await redis.del(CACHE_KEYS.PRODUCT(product.slug));
  }

  return expiredOrders.length;
}

/**
 * 删除旧订单 (根据配置天数)
 */
export async function deleteOldOrders(): Promise<number> {
  const deleteDays = await getOrderAutoDeleteDays();
  const deleteDate = new Date(Date.now() - deleteDays * 24 * 60 * 60 * 1000);

  const result = await prisma.order.deleteMany({
    where: {
      status: { in: ["COMPLETED", "CANCELLED"] },
      createdAt: { lt: deleteDate },
    },
  });

  return result.count;
}

/**
 * 管理员手动发货
 */
export async function manualDeliver(orderId: string): Promise<OrderWithItems> {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: {
      items: {
        include: {
          product: {
            select: { id: true, name: true, slug: true },
          },
        },
      },
    },
  });

  if (!order) {
    throw new Error("订单不存在");
  }

  if (order.status !== "PAID") {
    throw new Error("订单状态不正确");
  }

  // 分配卡密
  for (const item of order.items) {
    await allocateCardKeys(item.productId, item.quantity, item.id);
  }

  const updatedOrder = await prisma.order.update({
    where: { id: orderId },
    data: { status: "DELIVERED" },
    include: {
      items: {
        include: {
          cardKeys: true,
          product: {
            select: { id: true, name: true, slug: true },
          },
        },
      },
    },
  });

  return updatedOrder as OrderWithItems;
}

/**
 * 订单退款
 */
export async function refundOrder(orderId: string, adminRemark?: string): Promise<Order> {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
  });

  if (!order) {
    throw new Error("订单不存在");
  }

  if (!["PAID", "DELIVERED"].includes(order.status)) {
    throw new Error("订单状态不支持退款");
  }

  // 更新订单状态
  const updatedOrder = await prisma.order.update({
    where: { id: orderId },
    data: {
      status: "REFUNDED",
      adminRemark,
    },
  });

  // 如果是余额支付，退回余额
  if (order.paymentMethod === "BALANCE" && order.userId) {
    await prisma.user.update({
      where: { id: order.userId },
      data: {
        balance: { increment: order.payAmount },
      },
    });

    await prisma.balanceLog.create({
      data: {
        userId: order.userId,
        type: "REFUND",
        amount: order.payAmount,
        balance: 0, // 将在查询时更新
        orderId: order.id,
        remark: `订单 ${order.orderNo} 退款`,
      },
    });
  }

  return updatedOrder;
}
