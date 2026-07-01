ALTER TABLE "devices" RENAME TO "device_sessions";

ALTER TABLE "device_sessions" RENAME COLUMN "name" TO "deviceName";
ALTER TABLE "device_sessions" RENAME COLUMN "iat" TO "lastActiveAt";
ALTER TABLE "device_sessions" RENAME COLUMN "exp" TO "expiresAt";

ALTER TABLE "device_sessions"
  ALTER COLUMN "lastActiveAt" TYPE TIMESTAMPTZ USING to_timestamp("lastActiveAt"),
  ALTER COLUMN "expiresAt" TYPE TIMESTAMPTZ USING to_timestamp("expiresAt");

ALTER TABLE "device_sessions"
  RENAME CONSTRAINT "devices_pkey" TO "device_sessions_pkey";
ALTER TABLE "device_sessions"
  RENAME CONSTRAINT "devices_userId_fkey" TO "device_sessions_userId_fkey";
ALTER INDEX "devices_userId_idx" RENAME TO "device_sessions_userId_idx";
