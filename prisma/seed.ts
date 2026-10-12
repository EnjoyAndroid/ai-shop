import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { logError } from "../src/lib/logger";
import { adminPasswordSchema } from "../src/lib/password-rules";

const prisma = new PrismaClient();

async function main() {
  const existingAdmin = await prisma.admin.findUnique({ where: { username: "admin" } });
  const adminPassword = process.env.ADMIN_PASSWORD;
  if (!existingAdmin && !adminPasswordSchema.safeParse(adminPassword).success) {
    throw new Error("首次初始化需要配置至少12位、最多72个 UTF-8 字节的 ADMIN_PASSWORD");
  }
  console.log("🌱 开始种子数据...");

  // 创建会员等级
  console.log("创建会员等级...");
  const levels = await Promise.all([
    prisma.userLevel.upsert({
      where: { name: "普通会员" },
      update: {},
      create: {
        name: "普通会员",
        minSpent: 0,
        discount: 100, // 不打折
        sort: 0,
      },
    }),
    prisma.userLevel.upsert({
      where: { name: "银牌会员" },
      update: {},
      create: {
        name: "银牌会员",
        minSpent: 10000, // 100元
        discount: 95, // 95折
        sort: 1,
      },
    }),
    prisma.userLevel.upsert({
      where: { name: "金牌会员" },
      update: {},
      create: {
        name: "金牌会员",
        minSpent: 50000, // 500元
        discount: 90, // 9折
        sort: 2,
      },
    }),
    prisma.userLevel.upsert({
      where: { name: "钻石会员" },
      update: {},
      create: {
        name: "钻石会员",
        minSpent: 100000, // 1000元
        discount: 85, // 85折
        sort: 3,
      },
    }),
  ]);
  console.log(`✓ 创建了 ${levels.length} 个会员等级`);

  // 创建分类
  console.log("创建商品分类...");
  const categories = await Promise.all([
    prisma.category.upsert({
      where: { slug: "chatgpt" },
      update: {},
      create: {
        name: "ChatGPT",
        slug: "chatgpt",
        description: "OpenAI ChatGPT 相关服务",
        icon: "🤖",
        sort: 1,
      },
    }),
    prisma.category.upsert({
      where: { slug: "claude" },
      update: {},
      create: {
        name: "Claude",
        slug: "claude",
        description: "Anthropic Claude 相关服务",
        icon: "🧠",
        sort: 2,
      },
    }),
    prisma.category.upsert({
      where: { slug: "cursor" },
      update: {},
      create: {
        name: "Cursor",
        slug: "cursor",
        description: "Cursor AI 编程助手",
        icon: "💻",
        sort: 3,
      },
    }),
    prisma.category.upsert({
      where: { slug: "midjourney" },
      update: {},
      create: {
        name: "Midjourney",
        slug: "midjourney",
        description: "Midjourney AI 绘画",
        icon: "🎨",
        sort: 4,
      },
    }),
    prisma.category.upsert({
      where: { slug: "other" },
      update: {},
      create: {
        name: "其他服务",
        slug: "other",
        description: "其他 AI 工具和服务",
        icon: "✨",
        sort: 99,
      },
    }),
  ]);
  console.log(`✓ 创建了 ${categories.length} 个分类`);

  // 创建商品
  console.log("创建示例商品...");
  const products = await Promise.all([
    prisma.product.upsert({
      where: { slug: "chatgpt-plus-1month" },
      update: {},
      create: {
        name: "ChatGPT Plus 会员 1个月",
        slug: "chatgpt-plus-1month",
        description: "ChatGPT Plus 会员账号，有效期1个月，可使用 GPT-4",
        content: `## 商品说明

- ChatGPT Plus 会员账号
- 有效期：1个月
- 支持 GPT-4 模型
- 优先访问新功能

## 使用方法

1. 收到卡密后登录 chat.openai.com
2. 使用提供的账号密码登录
3. 开始使用 ChatGPT Plus

## 注意事项

- 请勿更改账号密码
- 请勿分享给他人使用
- 如有问题请联系客服`,
        categoryId: categories[0].id,
        price: 9900, // 99元
        originalPrice: 14900,
        sort: 1,
        minQuantity: 1,
        maxQuantity: 5,
      },
    }),
    prisma.product.upsert({
      where: { slug: "claude-pro-1month" },
      update: {},
      create: {
        name: "Claude Pro 会员 1个月",
        slug: "claude-pro-1month",
        description: "Claude Pro 会员账号，有效期1个月",
        categoryId: categories[1].id,
        price: 12900,
        originalPrice: 15900,
        sort: 1,
        minQuantity: 1,
        maxQuantity: 3,
      },
    }),
    prisma.product.upsert({
      where: { slug: "cursor-pro-1month" },
      update: {},
      create: {
        name: "Cursor Pro 会员 1个月",
        slug: "cursor-pro-1month",
        description: "Cursor Pro AI 编程助手会员",
        categoryId: categories[2].id,
        price: 15900,
        sort: 1,
        minQuantity: 1,
        maxQuantity: 3,
      },
    }),
    prisma.product.upsert({
      where: { slug: "midjourney-standard-1month" },
      update: {},
      create: {
        name: "Midjourney Standard 1个月",
        slug: "midjourney-standard-1month",
        description: "Midjourney Standard Plan 会员账号",
        categoryId: categories[3].id,
        price: 19900,
        sort: 1,
        minQuantity: 1,
        maxQuantity: 2,
      },
    }),
  ]);
  console.log(`✓ 创建了 ${products.length} 个商品`);

  // 创建管理员
  console.log("创建管理员账号...");
  const hashedPassword = existingAdmin?.password || await bcrypt.hash(adminPassword!, 12);
  const admin = await prisma.admin.upsert({
    where: { username: "admin" },
    update: {},
    create: {
      username: "admin",
      password: hashedPassword,
      name: "超级管理员",
      role: "SUPER_ADMIN",
    },
  });
  console.log(`✓ 管理员已初始化: ${admin.username}（已有账号密码保持不变）`);

  // 创建公告
  console.log("创建示例公告...");
  const announcement = await prisma.announcement.upsert({
    where: { id: "welcome" },
    update: {},
    create: {
      id: "welcome",
      title: "欢迎使用 AI Shop",
      content: "本站提供各类 AI 服务的自助充值，支付成功后自动发货。如有问题请联系客服。",
      type: "info",
      isPinned: true,
    },
  });
  console.log(`✓ 创建公告: ${announcement.title}`);

  for (const [key, value] of Object.entries({ siteName: "AI Shop", siteUrl: process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000", orderExpireMinutes: "10", orderAutoDeleteDays: "90", alipayEnabled: "false", wechatEnabled: "false", usdtEnabled: "false", balanceEnabled: "true" })) {
    await prisma.systemSetting.upsert({ where: { key }, update: {}, create: { key, value } });
  }
  console.log("\n🎉 种子数据完成！");
  console.log("\n📝 测试账号:");
  console.log("  管理员: admin；密码由 ADMIN_PASSWORD 配置，首次初始化必须配置");
  console.log("\n🚀 运行 npm run dev 启动开发服务器");
}

main()
  .catch((e) => {
    logError("Database seed", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
