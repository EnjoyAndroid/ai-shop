-- No legacy order compatibility: the explicitly approved test order is removed separately.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM "Order") THEN
    RAISE EXCEPTION 'Order query migration requires an empty Order table. Remove only the approved test order before applying.';
  END IF;
END $$;
ALTER TABLE "Order" DROP COLUMN "queryPassword", ADD COLUMN "queryPasswordHash" TEXT;
CREATE INDEX "Order_email_createdAt_id_idx" ON "Order"("email", "createdAt", "id");
