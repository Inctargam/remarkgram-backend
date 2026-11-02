CREATE INDEX "payments_blocking_renewal_lookup_idx"
ON "payments"("user_id", "type", "status");
