-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "FileUploadStatus" AS ENUM ('PENDING', 'COMPLETED', 'REJECTED');

-- CreateTable
CREATE TABLE "files" (
    "id" UUID NOT NULL,
    "userId" INTEGER NOT NULL,
    "objectKey" TEXT NOT NULL,
    "originalFilename" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "uploadStatus" "FileUploadStatus" NOT NULL DEFAULT 'PENDING',
    "uploadExpiresAt" TIMESTAMPTZ NOT NULL,
    "uploadedAt" TIMESTAMPTZ,
    "deletedAt" TIMESTAMPTZ,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "files_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "files_objectKey_key" ON "files"("objectKey");

-- CreateIndex
CREATE INDEX "files_uploadExpiresAt_idx" ON "files"("uploadExpiresAt") WHERE ("uploadStatus" = 'PENDING' AND "deletedAt" IS NULL);
