/*
  Warnings:

  - A unique constraint covering the columns `[user_id]` on the table `payments` will be added. If there are existing duplicate values, this will fail.

*/
-- DropIndex
DROP INDEX "payments_active_initial_subscription_key";

-- CreateIndex
CREATE UNIQUE INDEX "payments_active_initial_subscription_key" ON "payments"("user_id") WHERE ("checkout_purpose" = 'INITIAL_SUBSCRIPTION' AND ("status" IN ('CREATED', 'PENDING') OR ("status" = 'SUCCEEDED' AND "subscription_id" IS NULL)));
