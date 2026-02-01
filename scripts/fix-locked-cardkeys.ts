/**
 * 修复 LOCKED 状态的卡密
 * 将已取消订单的 LOCKED 卡密释放为 AVAILABLE
 *
 * 运行方式: npx tsx scripts/fix-locked-cardkeys.ts
 */

const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

async function fixLockedCardKeys() {
  console.log("开始修复 LOCKED 状态的卡密...\n");

  // 查找所有 LOCKED 状态的卡密
  const lockedCardKeys = await prisma.cardKey.findMany({
    where: { status: "LOCKED" },
    include: {
      orderItem: {
        include: {
          order: true,
        },
      },
    },
  });

  console.log(`找到 ${lockedCardKeys.length} 个 LOCKED 状态的卡密\n`);

  if (lockedCardKeys.length === 0) {
    console.log("没有需要修复的卡密");
    return;
  }

  // 检查关联订单的状态
  let fixedCount = 0;
  for (const cardKey of lockedCardKeys) {
    const orderItem = cardKey.orderItem;
    const order = orderItem?.order;

    console.log(`卡密 ID: ${cardKey.id}`);
    console.log(`  关联订单项: ${orderItem?.id || "无"}`);
    console.log(`  订单状态: ${order?.status || "无"}`);

    // 如果订单已取消或不存在，释放卡密
    if (!order || order.status === "CANCELLED" || order.status === "REFUNDED") {
      await prisma.cardKey.update({
        where: { id: cardKey.id },
        data: {
          status: "AVAILABLE",
          orderId: null,
        },
      });
      console.log(`  ✓ 已释放为 AVAILABLE\n`);
      fixedCount++;
    } else if (order.status === "PENDING") {
      // 检查订单是否已过期
      if (order.expiredAt && new Date(order.expiredAt) < new Date()) {
        // 订单已过期，取消订单并释放卡密
        await prisma.order.update({
          where: { id: order.id },
          data: { status: "CANCELLED" },
        });
        await prisma.cardKey.update({
          where: { id: cardKey.id },
          data: {
            status: "AVAILABLE",
            orderId: null,
          },
        });
        console.log(`  ✓ 订单已过期，已取消并释放卡密\n`);
        fixedCount++;
      } else {
        console.log(`  - 订单未过期，保持 LOCKED 状态\n`);
      }
    } else {
      console.log(`  - 订单状态为 ${order.status}，保持 LOCKED 状态\n`);
    }
  }

  console.log(`\n修复完成！共释放 ${fixedCount} 个卡密`);
}

fixLockedCardKeys()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
