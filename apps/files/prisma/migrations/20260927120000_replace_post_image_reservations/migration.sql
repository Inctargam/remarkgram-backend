BEGIN;

-- Старые workflow должны быть остановлены до миграции. Их резервы отменяются.
UPDATE "files" SET "uploadStatus" = 'COMPLETED', "reservationId" = NULL,
  "updatedAt" = CURRENT_TIMESTAMP WHERE "uploadStatus" = 'RESERVED';

ALTER TABLE "image_upload_reservations" RENAME TO "post_image_attachment_operations";
ALTER TABLE "post_image_attachment_operations"
  RENAME CONSTRAINT "image_upload_reservations_pkey" TO "post_image_attachment_operations_pkey";
ALTER TABLE "post_image_attachment_operations" ADD COLUMN "fileIdsHash" VARCHAR(64);
-- UUID имеют канонический нижний регистр; порядок идентификаторов для Files не важен.
UPDATE "post_image_attachment_operations" AS operation
SET "fileIdsHash" = encode(sha256(convert_to(COALESCE((
  SELECT string_agg(id::text, ',' ORDER BY id::text COLLATE "C")
  FROM unnest(operation."uploadIds") AS id
), ''), 'UTF8')), 'hex');
ALTER TABLE "post_image_attachment_operations" ALTER COLUMN "fileIdsHash" SET NOT NULL;
ALTER TABLE "post_image_attachment_operations" DROP COLUMN "uploadIds";

CREATE TYPE "PostImageAttachmentStatus" AS ENUM ('ATTACHED', 'CANCELLED');
ALTER TABLE "post_image_attachment_operations" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "post_image_attachment_operations" ALTER COLUMN "status" TYPE "PostImageAttachmentStatus"
  USING (CASE WHEN "status"::text = 'ATTACHED' THEN 'ATTACHED' ELSE 'CANCELLED' END)::"PostImageAttachmentStatus";
DROP TYPE "ImageUploadReservationStatus";

ALTER TABLE "files" RENAME COLUMN "reservationId" TO "postImageAttachmentOperationId";
ALTER TABLE "files" RENAME CONSTRAINT "files_reservationId_fkey" TO "files_postImageAttachmentOperationId_fkey";
ALTER INDEX "files_userId_reservationId_idx" RENAME TO "files_userId_postImageAttachmentOperationId_idx";

-- Частичные индексы зависят от прежнего enum и пересоздаются после смены типа.
DROP INDEX "files_uploadExpiresAt_idx";
DROP INDEX "files_uploadedAt_idx";
DROP INDEX "files_updatedAt_idx";
ALTER TYPE "FileUploadStatus" RENAME TO "FileUploadStatus_old";
CREATE TYPE "FileUploadStatus" AS ENUM ('PENDING', 'COMPLETED', 'REJECTED', 'ATTACHED');
ALTER TABLE "files" ALTER COLUMN "uploadStatus" DROP DEFAULT;
ALTER TABLE "files" ALTER COLUMN "uploadStatus" TYPE "FileUploadStatus"
  USING "uploadStatus"::text::"FileUploadStatus";
ALTER TABLE "files" ALTER COLUMN "uploadStatus" SET DEFAULT 'PENDING';
DROP TYPE "FileUploadStatus_old";
CREATE INDEX "files_uploadExpiresAt_idx" ON "files"("uploadExpiresAt")
  WHERE "uploadStatus" = 'PENDING' AND "deletedAt" IS NULL;
CREATE INDEX "files_uploadedAt_idx" ON "files"("uploadedAt")
  WHERE "uploadStatus" = 'COMPLETED' AND "postImageAttachmentOperationId" IS NULL AND "deletedAt" IS NULL;
CREATE INDEX "files_updatedAt_idx" ON "files"("updatedAt")
  WHERE "uploadStatus" = 'REJECTED' AND "deletedAt" IS NULL;

COMMIT;
