ALTER TYPE "PaymentStatus" RENAME VALUE 'PAID' TO 'SUCCEEDED';

ALTER TABLE "payments"
  RENAME COLUMN "provider_id" TO "provider_checkout_id";

ALTER TABLE "payments"
  ALTER COLUMN "provider_checkout_id" DROP NOT NULL,
  ADD COLUMN "provider_payment_id" TEXT;

DROP INDEX "payments_idempotent_key_key";

CREATE UNIQUE INDEX "payments_user_id_idempotent_key_key"
  ON "payments"("user_id", "idempotent_key");
CREATE UNIQUE INDEX "payments_provider_type_provider_checkout_id_key"
  ON "payments"("provider_type", "provider_checkout_id");
CREATE UNIQUE INDEX "payments_provider_type_provider_payment_id_key"
  ON "payments"("provider_type", "provider_payment_id");
CREATE INDEX "payments_user_id_idx" ON "payments"("user_id");
CREATE INDEX "payments_status_idx" ON "payments"("status");
CREATE INDEX "payments_created_at_idx" ON "payments"("created_at");

ALTER TABLE "payment_webhooks" ADD COLUMN "processing_error" TEXT;
