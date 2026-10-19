-- Внешние ссылки Stripe/PayPal сохраняются отдельно от локального subscription_id.
ALTER TABLE "payments"
ADD COLUMN "provider_subscription_id" TEXT,
ADD COLUMN "provider_invoice_id" TEXT,
ADD COLUMN "provider_customer_id" TEXT,
ADD COLUMN "checkout_expires_at" TIMESTAMPTZ;

CREATE UNIQUE INDEX "payments_provider_type_provider_invoice_id_key"
ON "payments"("provider_type", "provider_invoice_id");
