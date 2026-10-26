-- Checkout-specific fields remain nullable so future RENEWAL rows can have no Checkout purpose.
-- CreateEnum
CREATE TYPE "CheckoutPurpose" AS ENUM ('INITIAL_SUBSCRIPTION', 'SUBSCRIPTION_EXTENSION');

-- AlterTable
ALTER TABLE "payments" ADD COLUMN "checkout_purpose" "CheckoutPurpose",
ADD COLUMN "target_subscription_id" UUID,
ADD COLUMN "auto_renewal_requested" BOOLEAN;

-- Legacy rows were all created by the user-facing Checkout flow.
UPDATE "payments"
SET "checkout_purpose" = 'INITIAL_SUBSCRIPTION',
    "auto_renewal_requested" = TRUE;

-- CreateIndex
CREATE UNIQUE INDEX "payments_active_initial_subscription_key" ON "payments"("user_id") WHERE ("checkout_purpose" = 'INITIAL_SUBSCRIPTION' AND "status" IN ('CREATED', 'PENDING'));
