-- Additive correction: existing migrations and legacy cent columns remain compatible.
ALTER TABLE "SupportTurn" ADD COLUMN "latencyMs" INTEGER, ADD COLUMN "clearedAt" TIMESTAMP(3);
ALTER TABLE "SupportModelCall" ADD COLUMN "reservedCny" DECIMAL(18,8) NOT NULL DEFAULT 0,
 ADD COLUMN "settledCny" DECIMAL(18,8), ADD COLUMN "accountingState" TEXT NOT NULL DEFAULT 'LEGACY';
ALTER TABLE "SupportBudgetDay" ADD COLUMN "reservedCny" DECIMAL(18,8) NOT NULL DEFAULT 0,
 ADD COLUMN "settledCny" DECIMAL(18,8) NOT NULL DEFAULT 0;
ALTER TABLE "SupportRiskEvent" ADD COLUMN "bucket" TEXT, ADD COLUMN "count" INTEGER NOT NULL DEFAULT 1;
CREATE UNIQUE INDEX "SupportRiskEvent_bucket_key" ON "SupportRiskEvent"("bucket");
UPDATE "SupportModelCall" SET "phase" = 'planner' WHERE "errorCode" LIKE 'SCOPE_%';
UPDATE "SupportTurn" t SET "modelTurn" = true WHERE EXISTS (SELECT 1 FROM "SupportModelCall" c WHERE c."turnId" = t.id);
