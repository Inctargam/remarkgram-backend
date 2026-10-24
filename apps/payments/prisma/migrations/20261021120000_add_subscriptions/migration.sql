-- CreateEnum
CREATE TYPE "SubscriptionStatus" AS ENUM ('PENDING', 'ACTIVE', 'EXPIRED');

-- CreateEnum
CREATE TYPE "AutoRenewalStatus" AS ENUM ('DISABLED', 'ENABLING', 'ENABLED', 'DISABLING', 'RETIRED');

-- CreateEnum
CREATE TYPE "SubscriptionPaymentAction" AS ENUM ('CREATED', 'SCHEDULED', 'RENEWED');

-- CreateEnum
CREATE TYPE "SubscriptionPaymentProcessingStatus" AS ENUM ('CANCELLATION_PENDING', 'BINDING_PENDING', 'COMPLETED');

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
    "auto_renewal_change_id" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subscription_payment_applications" (
    "payment_id" UUID NOT NULL,
    "subscription_id" UUID NOT NULL,
    "previous_subscription_id" UUID,
    "previous_provider_subscription_id" TEXT,
    "action" "SubscriptionPaymentAction" NOT NULL,
    "processing_status" "SubscriptionPaymentProcessingStatus" NOT NULL,
    "bound_provider_subscription_id" TEXT,
    "next_subscription_starts_at" TIMESTAMPTZ NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "subscription_payment_applications_pkey" PRIMARY KEY ("payment_id")
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
CREATE INDEX "subscription_payment_applications_previous_subscription_id_idx"
ON "subscription_payment_applications"("previous_subscription_id");

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
ALTER TABLE "subscription_payment_applications" ADD CONSTRAINT "subscription_payment_applications_previous_subscription_id_fkey"
FOREIGN KEY ("previous_subscription_id") REFERENCES "subscriptions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
