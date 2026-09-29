-- AlterEnum
ALTER TYPE "FileUploadStatus" ADD VALUE 'RESERVED';
ALTER TYPE "FileUploadStatus" ADD VALUE 'ATTACHED';

-- AlterTable
ALTER TABLE "files"
ADD COLUMN "reservationId" UUID,
ADD COLUMN "reservationExpiresAt" TIMESTAMPTZ;

-- CreateIndex
CREATE INDEX "files_userId_reservationId_idx" ON "files"("userId", "reservationId");
