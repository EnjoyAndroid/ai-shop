ALTER TABLE "SupportTurn"
  ADD COLUMN "clientIp" TEXT,
  ADD COLUMN "clientIpTrusted" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "identityHash" TEXT,
  ADD COLUMN "modelTurn" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "SupportModelCall"
  ADD COLUMN "phase" TEXT NOT NULL DEFAULT 'answer',
  ADD COLUMN "sequence" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "budgetDay" TIMESTAMP(3),
  ADD COLUMN "reservedCents" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "settledCents" INTEGER,
  ADD COLUMN "rateSnapshot" JSONB;

CREATE TABLE "SupportBlock" (
  "id" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "keyHash" TEXT NOT NULL,
  "label" TEXT NOT NULL,
  "reason" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "revokedAt" TIMESTAMP(3),
  "createdBy" TEXT NOT NULL,
  "revokedBy" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SupportBlock_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SupportRiskEvent" (
  "id" TEXT NOT NULL,
  "category" TEXT NOT NULL,
  "identityHash" TEXT,
  "userId" TEXT,
  "clientIp" TEXT,
  "details" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SupportRiskEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "SupportTurn_clientIp_createdAt_idx" ON "SupportTurn"("clientIp", "createdAt");
CREATE INDEX "SupportTurn_identityHash_createdAt_idx" ON "SupportTurn"("identityHash", "createdAt");
CREATE INDEX "SupportModelCall_phase_createdAt_idx" ON "SupportModelCall"("phase", "createdAt");
CREATE INDEX "SupportBlock_kind_keyHash_expiresAt_idx" ON "SupportBlock"("kind", "keyHash", "expiresAt");
CREATE INDEX "SupportBlock_expiresAt_idx" ON "SupportBlock"("expiresAt");
CREATE INDEX "SupportRiskEvent_createdAt_idx" ON "SupportRiskEvent"("createdAt");
CREATE INDEX "SupportRiskEvent_category_createdAt_idx" ON "SupportRiskEvent"("category", "createdAt");
CREATE INDEX "SupportRiskEvent_identityHash_createdAt_idx" ON "SupportRiskEvent"("identityHash", "createdAt");
CREATE INDEX "SupportRiskEvent_clientIp_createdAt_idx" ON "SupportRiskEvent"("clientIp", "createdAt");
