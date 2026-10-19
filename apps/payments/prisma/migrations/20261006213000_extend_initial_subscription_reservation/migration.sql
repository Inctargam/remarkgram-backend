-- CREATED/PENDING защищают создание первого Checkout от конкурентных запросов.
-- SUCCEEDED остается в резерве до создания и связывания локальной Subscription.
DROP INDEX IF EXISTS "payments_active_initial_subscription_key";

CREATE UNIQUE INDEX "payments_active_initial_subscription_key"
ON "payments"("user_id")
WHERE (
  "checkout_purpose" = 'INITIAL_SUBSCRIPTION'
  AND (
    "status" IN ('CREATED', 'PENDING')
    OR ("status" = 'SUCCEEDED' AND "subscription_id" IS NULL)
  )
);
