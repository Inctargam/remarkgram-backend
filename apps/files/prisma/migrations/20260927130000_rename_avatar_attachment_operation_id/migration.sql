BEGIN;

ALTER TABLE "files" RENAME COLUMN "attachmentOperationId" TO "avatarAttachmentOperationId";
ALTER INDEX "files_attachmentOperationId_key" RENAME TO "files_avatarAttachmentOperationId_key";

COMMIT;
