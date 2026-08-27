-- CreateIndex
CREATE INDEX "files_uploadedAt_idx" ON "files"("uploadedAt")
WHERE "uploadStatus" = 'COMPLETED' AND "reservationId" IS NULL AND "deletedAt" IS NULL;

-- CreateIndex
CREATE INDEX "files_updatedAt_idx" ON "files"("updatedAt")
WHERE "uploadStatus" = 'REJECTED' AND "deletedAt" IS NULL;
