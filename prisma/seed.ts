import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { logError } from "../src/lib/logger";
import { adminPasswordSchema } from "../src/lib/password-rules";

const prisma = new PrismaClient();

async function main() {
  const target = new URL(process.env.DATABASE_URL || "");
  if (process.env.APP_ENV !== "development" || target.pathname !== "/ai_shop_dev" || target.username !== "aishop_dev") throw new Error("Demo seed is restricted to the isolated development database");
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

  console.log("创建智能客服知识...");
  const supportArticles = [
    { id: "support-buying", title: "如何购买商品", question: "如何购买商品？", aliases: ["怎么买", "购买流程", "怎么下单"], keywords: ["购买", "下单", "付款"], category: "购买流程", content: "浏览商品后选择数量，填写下单邮箱和订单查询密码，选择付款页面显示的支付方式并完成支付。支付成功后可在订单详情查看、复制或下载卡密。订单过期时间以当前系统设置为准。" },
    { id: "support-order", title: "如何查询订单", question: "如何查询订单？", aliases: ["订单在哪里", "怎么查订单", "查看订单"], keywords: ["订单", "查询", "订单号"], category: "订单", content: "点击订单查询，输入下单邮箱或订单号，完成验证后查看订单列表。商品订单详情需要输入下单时设置的查询密码；登录会员可以在个人中心查看本人订单。充值订单仅支持登录后查看。" },
    { id: "support-delivery", title: "支付后如何领取卡密", question: "支付成功后怎么查看卡密？", aliases: ["兑换码在哪里", "付款后没看到卡密", "怎么拿激活码"], keywords: ["支付成功", "卡密", "兑换码", "发货"], category: "发货", content: "支付成功后打开订单详情即可查看、复制或下载卡密。邮件通知取决于店铺配置和实际投递结果，订单详情是领取卡密的主要入口。" },
    { id: "support-payment", title: "支付方式说明", question: "支持哪些支付方式？", aliases: ["怎么付款", "可以用什么支付", "付款方式"], keywords: ["支付", "支付宝", "微信", "USDT", "余额"], category: "支付", content: "客服会根据当前付款页面显示的已启用方式回答。实际可用方式可能因商店配置和凭据状态变化，请以付款页面为准。" },
    { id: "support-invalid", title: "卡密无法使用", question: "卡密无法使用怎么办？", aliases: ["激活码无效", "卡密错误", "兑换失败"], keywords: ["卡密", "无效", "无法使用", "售后"], category: "售后", content: "请先确认商品说明、输入内容、空格和大小写。仍无法使用时，请保留订单号和错误提示，通过智能客服转人工并提供必要截图；不要在聊天中发送密码或完整卡密。" },
    { id: "support-account", title: "注册和登录帮助", question: "如何注册或找回密码？", aliases: ["忘记密码", "收不到重置邮件", "怎么注册"], keywords: ["注册", "登录", "密码", "邮箱"], category: "账户", content: "使用邮箱注册或登录。忘记密码时使用找回密码功能，并检查垃圾邮件文件夹；邮件服务异常时请联系客服。手机号注册和登录已移除。" },
    { id: "support-refund", title: "退款和售后", question: "可以申请退款吗？", aliases: ["能不能退款", "退款政策", "怎么退钱"], keywords: ["退款", "售后", "虚拟商品"], category: "售后", content: "虚拟商品的退款条件以店铺已发布政策和人工审核结果为准。请不要根据客服自动回答作出退款承诺；如遇重复扣款、卡密异常或其他订单问题，请提供订单号转人工处理。" },
    { id: "support-contact", title: "联系客服", question: "如何联系客服？", aliases: ["人工客服", "客服联系方式", "找客服"], keywords: ["客服", "微信", "Telegram", "人工"], category: "联系客服", content: "智能客服可以先回答常见问题。需要人工处理时，客服面板会展示当前已配置的微信客服二维码或 Telegram 联系方式；未配置的渠道不会显示。" },
  ];
  for (const article of supportArticles) await prisma.supportArticle.upsert({ where: { id: article.id }, update: {}, create: { ...article, status: "PUBLISHED", publishedAt: new Date() } });
  console.log(`✓ 创建了 ${supportArticles.length} 条客服知识`);
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
