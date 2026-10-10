/*
  Warnings:

  - The values [REQUIRES_ACTION] on the enum `PaymentStatus` will be removed. If these variants are still used in the database, this will fail.

*/
-- AlterEnum
BEGIN;
CREATE TYPE "PaymentStatus_new" AS ENUM ('CREATED', 'PENDING', 'SUCCEEDED', 'FAILED', 'CANCELED');
ALTER TABLE "public"."payments" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "payments" ALTER COLUMN "status" TYPE "PaymentStatus_new" USING ("status"::text::"PaymentStatus_new");
ALTER TYPE "PaymentStatus" RENAME TO "PaymentStatus_old";
ALTER TYPE "PaymentStatus_new" RENAME TO "PaymentStatus";
DROP TYPE "public"."PaymentStatus_old";
ALTER TABLE "payments" ALTER COLUMN "status" SET DEFAULT 'CREATED';
COMMIT;

-- CreateTable
CREATE TABLE "payment_customers" (
    "id" UUID NOT NULL,
    "user_id" INTEGER NOT NULL,
    "provider_type" "PaymentProvider" NOT NULL,
    "provider_customer_id" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "payment_customers_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "payment_customers_user_id_idx" ON "payment_customers"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "payment_customers_user_id_provider_type_key" ON "payment_customers"("user_id", "provider_type");

-- CreateIndex
CREATE UNIQUE INDEX "payment_customers_provider_type_provider_customer_id_key" ON "payment_customers"("provider_type", "provider_customer_id");
