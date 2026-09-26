CREATE TABLE "avatar_deletion_requests" (
  "user_id" INTEGER NOT NULL,
  "idempotency_key" UUID NOT NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY ("user_id", "idempotency_key")
);
