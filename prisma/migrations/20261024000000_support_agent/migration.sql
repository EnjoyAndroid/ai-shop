ALTER TABLE "SupportConversation" ADD COLUMN "contextSummary" TEXT NOT NULL DEFAULT '';
-- Guest access expires after one inactive day; member access retains its deadline.
UPDATE "SupportConversation" SET "expiresAt" = LEAST("expiresAt", "updatedAt" + INTERVAL '1 day')
WHERE "userId" IS NULL;
