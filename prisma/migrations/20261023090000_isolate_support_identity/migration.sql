-- A conversation belongs to either an authenticated account or an anonymous browser.
-- Remove the old shared cookie association before enforcing that boundary.
UPDATE "SupportConversation"
SET "anonymousKey" = NULL
WHERE "userId" IS NOT NULL;

ALTER TABLE "SupportConversation"
ADD CONSTRAINT "SupportConversation_identity_check"
CHECK ("userId" IS NULL OR "anonymousKey" IS NULL);
