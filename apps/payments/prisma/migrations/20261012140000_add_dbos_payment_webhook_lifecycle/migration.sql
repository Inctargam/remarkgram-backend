CREATE TYPE "WebhookProcessingStatus" AS ENUM (
  'RECEIVED',
  'RETRYING',
  'PROCESSED',
  'IGNORED',
  'DEAD'
);

ALTER TABLE "payment_webhooks"
  ADD COLUMN "provider_created_at" TIMESTAMPTZ,
  ADD COLUMN "processing_status" "WebhookProcessingStatus" NOT NULL DEFAULT 'RECEIVED',
  ADD COLUMN "processing_attempts" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "workflow_id" TEXT,
  ADD COLUMN "processing_error_code" TEXT;

-- Local rows created before the DBOS workflow are retained only for migration
-- safety. Production has never run the superseded lease implementation.
UPDATE "payment_webhooks"
SET "provider_created_at" = "received_at",
    "workflow_id" = 'legacy-payment-webhook:' || "id"::text
WHERE "provider_created_at" IS NULL OR "workflow_id" IS NULL;

ALTER TABLE "payment_webhooks"
  ALTER COLUMN "provider_created_at" SET NOT NULL,
  ALTER COLUMN "workflow_id" SET NOT NULL;

CREATE UNIQUE INDEX "payment_webhooks_workflow_id_key"
  ON "payment_webhooks"("workflow_id");

CREATE INDEX "payment_webhooks_processing_status_received_at_idx"
  ON "payment_webhooks"("processing_status", "received_at");

CREATE INDEX "payment_webhooks_event_type_received_at_idx"
  ON "payment_webhooks"("event_type", "received_at");
