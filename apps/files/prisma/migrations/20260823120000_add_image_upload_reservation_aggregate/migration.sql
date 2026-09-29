-- Старые незавершённые резервации не относятся к DBOS workflow и могут быть сброшены.
UPDATE "files"
SET "uploadStatus" = 'COMPLETED',
    "reservationId" = NULL
WHERE "uploadStatus" = 'RESERVED';

-- Для уже прикреплённых файлов старый reservationId больше не нужен.
UPDATE "files"
SET "reservationId" = NULL
WHERE "reservationId" IS NOT NULL;

ALTER TABLE "files" DROP COLUMN "reservationExpiresAt";

CREATE TYPE "ImageUploadReservationStatus" AS ENUM ('RESERVED', 'ATTACHED', 'RELEASED');

CREATE TABLE "image_upload_reservations" (
  "id" UUID NOT NULL,
  "userId" INTEGER NOT NULL,
  "uploadIds" UUID[] NOT NULL,
  "status" "ImageUploadReservationStatus" NOT NULL DEFAULT 'RESERVED',
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ NOT NULL,

  CONSTRAINT "image_upload_reservations_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "files"
ADD CONSTRAINT "files_reservationId_fkey"
FOREIGN KEY ("reservationId") REFERENCES "image_upload_reservations"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;
