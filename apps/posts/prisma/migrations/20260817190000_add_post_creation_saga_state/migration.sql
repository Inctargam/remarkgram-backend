-- Создание перечисления
CREATE TYPE "PostCreationOperationStatus" AS ENUM (
    'STARTED',
    'POST_CREATED',
    'COMPENSATION_PENDING',
    'COMPLETED',
    'FAILED'
);

-- Изменение таблицы
ALTER TABLE "posts" ADD COLUMN "published_at" TIMESTAMPTZ;

-- Существующие посты были созданы до появления саги и уже являются опубликованными.
UPDATE "posts" SET "published_at" = "created_at";

-- Создание таблицы
CREATE TABLE "post_creation_operations" (
    "id" UUID NOT NULL,
    "user_id" INTEGER NOT NULL,
    "idempotency_key" UUID NOT NULL,
    "description" TEXT,
    "image_ids" UUID[] NOT NULL,
    "status" "PostCreationOperationStatus" NOT NULL DEFAULT 'STARTED',
    "version" INTEGER NOT NULL DEFAULT 0,
    "reserve_operation_id" UUID NOT NULL,
    "attach_operation_id" UUID NOT NULL,
    "compensation_operation_id" UUID NOT NULL,
    "failure_code" TEXT,
    "post_id" INTEGER,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "post_creation_operations_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "post_creation_operations_state_check" CHECK (
        ("status" = 'STARTED' AND "post_id" IS NULL AND "failure_code" IS NULL)
        OR ("status" IN ('POST_CREATED', 'COMPLETED') AND "post_id" IS NOT NULL AND "failure_code" IS NULL)
        OR ("status" IN ('COMPENSATION_PENDING', 'FAILED') AND "post_id" IS NULL AND "failure_code" IS NOT NULL)
    )
);

-- Создание индекса
CREATE UNIQUE INDEX "post_creation_operations_post_id_key"
ON "post_creation_operations"("post_id");

-- Создание индекса
CREATE UNIQUE INDEX "post_creation_operations_user_id_idempotency_key_key"
ON "post_creation_operations"("user_id", "idempotency_key");

-- Добавление внешнего ключа
ALTER TABLE "post_creation_operations"
ADD CONSTRAINT "post_creation_operations_post_id_fkey"
FOREIGN KEY ("post_id") REFERENCES "posts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
