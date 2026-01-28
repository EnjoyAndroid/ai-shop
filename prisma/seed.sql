-- 创建会员等级
INSERT INTO "UserLevel" (id, name, "minSpent", discount, sort, "createdAt", "updatedAt") VALUES
  (gen_random_uuid(), '普通会员', 0, 100, 0, NOW(), NOW()),
  (gen_random_uuid(), '银牌会员', 10000, 95, 1, NOW(), NOW()),
  (gen_random_uuid(), '金牌会员', 50000, 90, 2, NOW(), NOW()),
  (gen_random_uuid(), '钻石会员', 100000, 85, 3, NOW(), NOW())
ON CONFLICT DO NOTHING;

-- 创建分类
INSERT INTO "Category" (id, name, slug, description, icon, sort, "isActive", "createdAt", "updatedAt") VALUES
  (gen_random_uuid(), 'ChatGPT', 'chatgpt', 'OpenAI ChatGPT 相关服务', '🤖', 1, true, NOW(), NOW()),
  (gen_random_uuid(), 'Claude', 'claude', 'Anthropic Claude 相关服务', '🧠', 2, true, NOW(), NOW()),
  (gen_random_uuid(), 'Cursor', 'cursor', 'Cursor AI 编程助手', '💻', 3, true, NOW(), NOW()),
  (gen_random_uuid(), 'Midjourney', 'midjourney', 'Midjourney AI 绘画', '🎨', 4, true, NOW(), NOW()),
  (gen_random_uuid(), '其他服务', 'other', '其他 AI 工具和服务', '✨', 99, true, NOW(), NOW())
ON CONFLICT DO NOTHING;

-- 创建商品
INSERT INTO "Product" (id, name, slug, description, "categoryId", price, "originalPrice", stock, "salesCount", sort, "minQuantity", "maxQuantity", "isActive", "createdAt", "updatedAt")
SELECT gen_random_uuid(), 'ChatGPT Plus 会员 1个月', 'chatgpt-plus-1month', 'ChatGPT Plus 会员账号，有效期1个月，可使用 GPT-4', id, 9900, 14900, 0, 0, 1, 1, 5, true, NOW(), NOW()
FROM "Category" WHERE slug = 'chatgpt'
ON CONFLICT DO NOTHING;

INSERT INTO "Product" (id, name, slug, description, "categoryId", price, "originalPrice", stock, "salesCount", sort, "minQuantity", "maxQuantity", "isActive", "createdAt", "updatedAt")
SELECT gen_random_uuid(), 'Claude Pro 会员 1个月', 'claude-pro-1month', 'Claude Pro 会员账号，有效期1个月', id, 12900, 15900, 0, 0, 1, 1, 3, true, NOW(), NOW()
FROM "Category" WHERE slug = 'claude'
ON CONFLICT DO NOTHING;

INSERT INTO "Product" (id, name, slug, description, "categoryId", price, stock, "salesCount", sort, "minQuantity", "maxQuantity", "isActive", "createdAt", "updatedAt")
SELECT gen_random_uuid(), 'Cursor Pro 会员 1个月', 'cursor-pro-1month', 'Cursor Pro AI 编程助手会员', id, 15900, 0, 0, 1, 1, 3, true, NOW(), NOW()
FROM "Category" WHERE slug = 'cursor'
ON CONFLICT DO NOTHING;

INSERT INTO "Product" (id, name, slug, description, "categoryId", price, stock, "salesCount", sort, "minQuantity", "maxQuantity", "isActive", "createdAt", "updatedAt")
SELECT gen_random_uuid(), 'Midjourney Standard 1个月', 'midjourney-standard-1month', 'Midjourney Standard Plan 会员账号', id, 19900, 0, 0, 1, 1, 2, true, NOW(), NOW()
FROM "Category" WHERE slug = 'midjourney'
ON CONFLICT DO NOTHING;

-- 创建管理员 (密码: admin123)
INSERT INTO "Admin" (id, username, password, name, role, "createdAt", "updatedAt") VALUES
  (gen_random_uuid(), 'admin', '$2a$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/X4/AQKUXJ1.dO4pLO', '超级管理员', 'SUPER_ADMIN', NOW(), NOW())
ON CONFLICT DO NOTHING;

-- 创建公告
INSERT INTO "Announcement" (id, title, content, type, "isPinned", "isActive", "createdAt", "updatedAt") VALUES
  ('welcome', '欢迎使用 AI Shop', '本站提供各类 AI 服务的自助充值，支付成功后自动发货。如有问题请联系客服。', 'info', true, true, NOW(), NOW())
ON CONFLICT DO NOTHING;
