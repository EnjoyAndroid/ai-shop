-- Smart support uses PostgreSQL as the source of truth. Retrieval indexes can be rebuilt.
CREATE TYPE "SupportArticleStatus" AS ENUM ('DRAFT', 'PUBLISHED');

CREATE TABLE "SupportArticle" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "question" TEXT NOT NULL,
    "aliases" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "keywords" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "category" TEXT NOT NULL DEFAULT 'general',
    "content" TEXT NOT NULL,
    "status" "SupportArticleStatus" NOT NULL DEFAULT 'DRAFT',
    "version" INTEGER NOT NULL DEFAULT 1,
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "SupportArticle_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SupportConversation" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "anonymousKey" TEXT,
    "title" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "SupportConversation_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SupportTurn" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "userText" TEXT NOT NULL,
    "answerText" TEXT,
    "sources" JSONB,
    "facts" JSONB,
    "status" TEXT NOT NULL DEFAULT 'COMPLETED',
    "feedback" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SupportTurn_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SupportModelCall" (
    "id" TEXT NOT NULL,
    "turnId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "requestModel" TEXT NOT NULL,
    "responseModel" TEXT,
    "inputTokens" INTEGER,
    "cachedTokens" INTEGER,
    "cacheWriteTokens" INTEGER,
    "outputTokens" INTEGER,
    "reasoningTokens" INTEGER,
    "totalTokens" INTEGER,
    "estimatedCost" DECIMAL(18,8),
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "usageStatus" TEXT NOT NULL DEFAULT 'MISSING',
    "latencyMs" INTEGER,
    "success" BOOLEAN NOT NULL DEFAULT false,
    "errorCode" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SupportModelCall_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SupportBudgetDay" (
    "day" TIMESTAMP(3) NOT NULL,
    "reservedCents" INTEGER NOT NULL DEFAULT 0,
    "settledCents" INTEGER NOT NULL DEFAULT 0,
    "alertSent" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "SupportBudgetDay_pkey" PRIMARY KEY ("day")
);

CREATE UNIQUE INDEX "SupportTurn_conversationId_requestId_key" ON "SupportTurn"("conversationId", "requestId");
CREATE INDEX "SupportArticle_status_category_idx" ON "SupportArticle"("status", "category");
CREATE INDEX "SupportArticle_publishedAt_idx" ON "SupportArticle"("publishedAt");
CREATE INDEX "SupportConversation_userId_updatedAt_idx" ON "SupportConversation"("userId", "updatedAt");
CREATE INDEX "SupportConversation_anonymousKey_updatedAt_idx" ON "SupportConversation"("anonymousKey", "updatedAt");
CREATE INDEX "SupportConversation_expiresAt_idx" ON "SupportConversation"("expiresAt");
CREATE INDEX "SupportTurn_conversationId_createdAt_idx" ON "SupportTurn"("conversationId", "createdAt");
CREATE INDEX "SupportTurn_createdAt_idx" ON "SupportTurn"("createdAt");
CREATE INDEX "SupportModelCall_createdAt_idx" ON "SupportModelCall"("createdAt");
CREATE INDEX "SupportModelCall_provider_requestModel_createdAt_idx" ON "SupportModelCall"("provider", "requestModel", "createdAt");

ALTER TABLE "SupportConversation" ADD CONSTRAINT "SupportConversation_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SupportTurn" ADD CONSTRAINT "SupportTurn_conversationId_fkey"
  FOREIGN KEY ("conversationId") REFERENCES "SupportConversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SupportModelCall" ADD CONSTRAINT "SupportModelCall_turnId_fkey"
  FOREIGN KEY ("turnId") REFERENCES "SupportTurn"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Initial published answers are intentionally short and reference live facts for prices,
-- stock, payments and order state. Administrators can edit or unpublish them later.
INSERT INTO "SupportArticle" ("id", "title", "question", "aliases", "keywords", "category", "content", "status", "publishedAt", "updatedAt") VALUES
('support-buying', '如何购买商品', '如何购买商品？', ARRAY['怎么买','购买流程','怎么下单'], ARRAY['购买','下单','付款'], '购买流程', '浏览商品后选择数量，填写下单邮箱和订单查询密码，选择付款页面显示的支付方式并完成支付。支付成功后可在订单详情查看、复制或下载卡密。订单过期时间以当前系统设置为准。', 'PUBLISHED', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('support-order', '如何查询订单', '如何查询订单？', ARRAY['订单在哪里','怎么查订单','查看订单'], ARRAY['订单','查询','订单号'], '订单', '点击订单查询，输入下单邮箱或订单号，完成验证后查看订单列表。商品订单详情需要输入下单时设置的查询密码；登录会员可以在个人中心查看本人订单。充值订单仅支持登录后查看。', 'PUBLISHED', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('support-delivery', '支付后如何领取卡密', '支付成功后怎么查看卡密？', ARRAY['兑换码在哪里','付款后没看到卡密','怎么拿激活码'], ARRAY['支付成功','卡密','兑换码','发货'], '发货', '支付成功后打开订单详情即可查看、复制或下载卡密。邮件通知取决于店铺配置和实际投递结果，订单详情是领取卡密的主要入口。', 'PUBLISHED', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('support-payment', '支付方式说明', '支持哪些支付方式？', ARRAY['怎么付款','可以用什么支付','付款方式'], ARRAY['支付','支付宝','微信','USDT','余额'], '支付', '客服会根据当前付款页面显示的已启用方式回答。实际可用方式可能因商店配置和凭据状态变化，请以付款页面为准。', 'PUBLISHED', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('support-invalid', '卡密无法使用', '卡密无法使用怎么办？', ARRAY['激活码无效','卡密错误','兑换失败'], ARRAY['卡密','无效','无法使用','售后'], '售后', '请先确认商品说明、输入内容、空格和大小写。仍无法使用时，请保留订单号和错误提示，通过智能客服转人工并提供必要截图；不要在聊天中发送密码或完整卡密。', 'PUBLISHED', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('support-account', '注册和登录帮助', '如何注册或找回密码？', ARRAY['忘记密码','收不到重置邮件','怎么注册'], ARRAY['注册','登录','密码','邮箱'], '账户', '使用邮箱注册或登录。忘记密码时使用找回密码功能，并检查垃圾邮件文件夹；邮件服务异常时请联系客服。手机号注册和登录已移除。', 'PUBLISHED', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('support-refund', '退款和售后', '可以申请退款吗？', ARRAY['能不能退款','退款政策','怎么退钱'], ARRAY['退款','售后','虚拟商品'], '售后', '虚拟商品的退款条件以店铺已发布政策和人工审核结果为准。请不要根据客服自动回答作出退款承诺；如遇重复扣款、卡密异常或其他订单问题，请提供订单号转人工处理。', 'PUBLISHED', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
('support-contact', '联系客服', '如何联系客服？', ARRAY['人工客服','客服联系方式','找客服'], ARRAY['客服','微信','Telegram','人工'], '联系客服', '智能客服可以先回答常见问题。需要人工处理时，客服面板会展示当前已配置的微信客服二维码或 Telegram 联系方式；未配置的渠道不会显示。', 'PUBLISHED', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("id") DO NOTHING;
