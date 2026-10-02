BEGIN;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "sessionVersion" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "Admin" ADD COLUMN     "sessionVersion" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "PaymentReceipt" (
    "id" TEXT NOT NULL,
    "orderId" TEXT,
    "method" "PaymentMethod" NOT NULL,
    "transactionId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PaymentReceipt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentQuote" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "method" "PaymentMethod" NOT NULL,
    "address" TEXT NOT NULL,
    "amountMicros" BIGINT NOT NULL,
    "exchangeRate" DECIMAL(18,8) NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reservation" TEXT,

    CONSTRAINT "PaymentQuote_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PaymentReceipt_orderId_key" ON "PaymentReceipt"("orderId");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentReceipt_method_transactionId_key" ON "PaymentReceipt"("method", "transactionId");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentQuote_orderId_key" ON "PaymentQuote"("orderId");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentQuote_reservation_key" ON "PaymentQuote"("reservation");

-- AddForeignKey
ALTER TABLE "PaymentReceipt" ADD CONSTRAINT "PaymentReceipt_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentQuote" ADD CONSTRAINT "PaymentQuote_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- 对旧版已支付流水建立防重记录。若同一通道流水被重复使用则迁移失败，需人工核对。
INSERT INTO "PaymentReceipt" (id, "orderId", method, "transactionId", amount, "createdAt")
SELECT 'legacy_' || id, id, "paymentMethod", "paymentNo", "payAmount", COALESCE("paidAt", "createdAt")
FROM "Order"
WHERE "paymentNo" IS NOT NULL AND "paymentNo" <> '' AND "paymentMethod" IS NOT NULL
  AND status IN ('PAID', 'DELIVERED', 'COMPLETED', 'REFUNDED');

ALTER TABLE "User" ADD CONSTRAINT "User_balance_nonnegative" CHECK (balance >= 0);
ALTER TABLE "PaymentReceipt" ADD CONSTRAINT "PaymentReceipt_amount_positive" CHECK (amount > 0);
ALTER TABLE "PaymentQuote" ADD CONSTRAINT "PaymentQuote_amount_positive" CHECK ("amountMicros" > 0);
COMMIT;
