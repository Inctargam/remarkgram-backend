-- CreateEnum
CREATE TYPE "SubscriptionStatus" AS ENUM ('PENDING', 'ACTIVE', 'EXPIRED');

-- CreateEnum
CREATE TYPE "AutoRenewalStatus" AS ENUM ('DISABLED', 'ENABLING', 'ENABLED', 'DISABLING', 'RETIRED');

-- CreateEnum
CREATE TYPE "SubscriptionPaymentAction" AS ENUM ('CREATED', 'SCHEDULED', 'RENEWED');

-- CreateEnum
CREATE TYPE "AutoRenewalOperationType" AS ENUM ('ENABLE', 'DISABLE', 'TRANSFER');

-- CreateEnum
CREATE TYPE "AutoRenewalOperationStatus" AS ENUM ('PENDING', 'BINDING_PENDING', 'COMPLETED');

-- CreateTable
CREATE TABLE "subscriptions" (
    "id" UUID NOT NULL,
    "user_id" INTEGER NOT NULL,
    "plan_id" INTEGER NOT NULL,
    "starts_at" TIMESTAMPTZ NOT NULL,
    "expires_at" TIMESTAMPTZ NOT NULL,
    "status" "SubscriptionStatus" NOT NULL,
    "provider" "PaymentProvider" NOT NULL,
    "provider_subscription_id" TEXT,
    "auto_renewal_status" "AutoRenewalStatus" NOT NULL DEFAULT 'DISABLED',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subscription_payment_applications" (
    "payment_id" UUID NOT NULL,
    "subscription_id" UUID NOT NULL,
    "action" "SubscriptionPaymentAction" NOT NULL,
    "next_subscription_starts_at" TIMESTAMPTZ NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "subscription_payment_applications_pkey" PRIMARY KEY ("payment_id")
);

-- CreateTable
CREATE TABLE "auto_renewal_operations" (
    "id" UUID NOT NULL,
    "user_id" INTEGER NOT NULL,
    "type" "AutoRenewalOperationType" NOT NULL,
    "status" "AutoRenewalOperationStatus" NOT NULL,
    "payment_id" UUID,
    "subscription_id" UUID NOT NULL,
    "provider" "PaymentProvider" NOT NULL,
    "provider_subscription_id" TEXT,
    "source_subscription_id" UUID,
    "source_provider_subscription_id" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "auto_renewal_operations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "subscriptions_provider_provider_subscription_id_key"
ON "subscriptions"("provider", "provider_subscription_id");

-- Один пользователь не может иметь две ACTIVE-подписки.
CREATE UNIQUE INDEX "subscriptions_user_id_key"
ON "subscriptions"("user_id") WHERE "status" = 'ACTIVE';

-- CreateIndex
CREATE INDEX "subscriptions_user_id_starts_at_idx" ON "subscriptions"("user_id", "starts_at");

-- CreateIndex
CREATE INDEX "subscriptions_status_expires_at_idx" ON "subscriptions"("status", "expires_at");

-- CreateIndex
CREATE INDEX "subscriptions_plan_id_idx" ON "subscriptions"("plan_id");

-- CreateIndex
CREATE INDEX "subscription_payment_applications_subscription_id_idx"
ON "subscription_payment_applications"("subscription_id");

-- CreateIndex
CREATE UNIQUE INDEX "auto_renewal_operations_payment_id_key" ON "auto_renewal_operations"("payment_id");

-- CreateIndex
CREATE INDEX "auto_renewal_operations_subscription_id_idx" ON "auto_renewal_operations"("subscription_id");

-- CreateIndex
CREATE INDEX "auto_renewal_operations_source_subscription_id_idx" ON "auto_renewal_operations"("source_subscription_id");

-- CreateIndex
CREATE INDEX "auto_renewal_operations_user_id_status_idx" ON "auto_renewal_operations"("user_id", "status");

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_plan_id_fkey"
FOREIGN KEY ("plan_id") REFERENCES "plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscription_payment_applications" ADD CONSTRAINT "subscription_payment_applications_payment_id_fkey"
FOREIGN KEY ("payment_id") REFERENCES "payments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscription_payment_applications" ADD CONSTRAINT "subscription_payment_applications_subscription_id_fkey"
FOREIGN KEY ("subscription_id") REFERENCES "subscriptions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "auto_renewal_operations" ADD CONSTRAINT "auto_renewal_operations_payment_id_fkey"
FOREIGN KEY ("payment_id") REFERENCES "subscription_payment_applications"("payment_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "auto_renewal_operations" ADD CONSTRAINT "auto_renewal_operations_subscription_id_fkey"
FOREIGN KEY ("subscription_id") REFERENCES "subscriptions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "auto_renewal_operations" ADD CONSTRAINT "auto_renewal_operations_source_subscription_id_fkey"
FOREIGN KEY ("source_subscription_id") REFERENCES "subscriptions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
