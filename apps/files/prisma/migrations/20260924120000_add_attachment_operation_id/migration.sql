ALTER TABLE "files" ADD COLUMN "attachmentOperationId" UUID;

CREATE UNIQUE INDEX "files_attachmentOperationId_key" ON "files"("attachmentOperationId");
