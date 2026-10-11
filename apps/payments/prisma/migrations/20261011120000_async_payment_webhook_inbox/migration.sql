CREATE TYPE "PaymentWebhookStatus" AS ENUM (
  'RECEIVED', 'PROCESSING', 'PROCESSED', 'IGNORED', 'ERROR', 'DEAD'
);
CREATE TYPE "PaymentApplicationStatus" AS ENUM ('NOT_READY', 'PENDING', 'APPLYING', 'APPLIED', 'ERROR');

ALTER TABLE "payments"
  ADD COLUMN "application_status" "PaymentApplicationStatus" NOT NULL DEFAULT 'NOT_READY',
  ADD COLUMN "application_attempts" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "application_available_at" TIMESTAMPTZ,
  ADD COLUMN "application_lease_until" TIMESTAMPTZ,
  ADD COLUMN "application_error_code" TEXT,
  ADD COLUMN "application_error" TEXT;

ALTER TABLE "payment_webhooks"
  ADD COLUMN "provider_created_at" TIMESTAMPTZ,
  ADD COLUMN "processing_status" "PaymentWebhookStatus" NOT NULL DEFAULT 'RECEIVED',
  ADD COLUMN "processing_attempts" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "processing_error_code" TEXT,
  ADD COLUMN "available_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "processing_started_at" TIMESTAMPTZ,
  ADD COLUMN "lease_until" TIMESTAMPTZ;

UPDATE "payment_webhooks"
SET "processing_status" = CASE
  WHEN "processed_at" IS NOT NULL AND "processing_error" IS NULL THEN 'PROCESSED'::"PaymentWebhookStatus"
  WHEN "processed_at" IS NOT NULL THEN 'IGNORED'::"PaymentWebhookStatus"
  ELSE 'RECEIVED'::"PaymentWebhookStatus"
END;

CREATE INDEX "payment_webhooks_processing_status_available_at_received_at_idx"
  ON "payment_webhooks"("processing_status", "available_at", "received_at");
CREATE INDEX "payment_webhooks_event_type_received_at_idx"
  ON "payment_webhooks"("event_type", "received_at");
CREATE INDEX "payments_status_application_status_application_available_at_idx"
  ON "payments"("status", "application_status", "application_available_at");
