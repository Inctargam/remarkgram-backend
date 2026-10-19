-- Preserve retryable events before removing the redundant enum value.
UPDATE "inbox_events"
SET "status" = 'RECEIVED'
WHERE "status" = 'FAILED';

ALTER TABLE "inbox_events"
ALTER COLUMN "status" DROP DEFAULT;

ALTER TYPE "InboxStatus" RENAME TO "InboxStatus_old";

CREATE TYPE "InboxStatus" AS ENUM ('RECEIVED', 'PROCESSED', 'DEAD');

ALTER TABLE "inbox_events"
ALTER COLUMN "status" TYPE "InboxStatus"
USING "status"::text::"InboxStatus";

ALTER TABLE "inbox_events"
ALTER COLUMN "status" SET DEFAULT 'RECEIVED';

DROP TYPE "InboxStatus_old";
