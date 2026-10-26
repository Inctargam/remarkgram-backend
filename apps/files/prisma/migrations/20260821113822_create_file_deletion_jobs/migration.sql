-- CreateEnum
CREATE TYPE "FileDeletionJobStatus" AS ENUM ('PENDING', 'DONE', 'DEAD');

-- CreateTable
CREATE TABLE "file_deletion_jobs" (
    "file_id" UUID NOT NULL,
    "object_key" TEXT NOT NULL,
    "status" "FileDeletionJobStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "done_at" TIMESTAMPTZ,
    "available_at" TIMESTAMPTZ NOT NULL,
    "lease_until" TIMESTAMPTZ,
    "last_error" TEXT,

    CONSTRAINT "file_deletion_jobs_pkey" PRIMARY KEY ("file_id")
);

-- CreateIndex
CREATE INDEX "file_deletion_jobs_status_available_at_idx" ON "file_deletion_jobs"("status", "available_at");
