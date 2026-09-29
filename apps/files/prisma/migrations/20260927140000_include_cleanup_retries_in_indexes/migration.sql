BEGIN;

-- Запрос очистки допускает deletedAt IS NULL OR deletedAt <= retryBefore.
-- Индексы должны включать ранее захваченные файлы, чтобы обслуживать обе ветки.
DROP INDEX "files_uploadExpiresAt_idx";
DROP INDEX "files_uploadedAt_idx";
DROP INDEX "files_updatedAt_idx";

CREATE INDEX "files_uploadExpiresAt_idx" ON "files"("uploadExpiresAt")
  WHERE "uploadStatus" = 'PENDING';
CREATE INDEX "files_uploadedAt_idx" ON "files"("uploadedAt")
  WHERE "uploadStatus" = 'COMPLETED' AND "postImageAttachmentOperationId" IS NULL;
CREATE INDEX "files_updatedAt_idx" ON "files"("updatedAt")
  WHERE "uploadStatus" = 'REJECTED';

COMMIT;
