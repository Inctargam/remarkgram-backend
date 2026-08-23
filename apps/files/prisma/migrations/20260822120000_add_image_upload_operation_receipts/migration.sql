-- Создание перечисления
CREATE TYPE "ImageUploadOperationKind" AS ENUM ('RESERVE', 'ATTACH', 'RELEASE');

-- Создание таблицы
CREATE TABLE "image_upload_operation_receipts" (
    "operationId" UUID NOT NULL,
    "kind" "ImageUploadOperationKind" NOT NULL,
    "userId" INTEGER NOT NULL,
    "reservationId" UUID NOT NULL,
    "uploadIds" UUID[] NOT NULL,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "image_upload_operation_receipts_pkey" PRIMARY KEY ("operationId")
);

-- Создание индекса
CREATE UNIQUE INDEX "image_upload_operation_receipts_kind_reservationId_key"
ON "image_upload_operation_receipts"("kind", "reservationId");
