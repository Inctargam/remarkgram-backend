-- CreateEnum
CREATE TYPE "RevokedReason" AS ENUM ('USER_LOGOUT', 'LOGOUT_ALL', 'PASSWORD_CHANGED', 'USER_LOCKED', 'ADMIN_ACTION', 'TOKEN_REUSE_DETECTED');

-- AlterTable
ALTER TABLE "device_sessions" ADD COLUMN     "revokedAt" TIMESTAMPTZ,
ADD COLUMN     "revokedReason" "RevokedReason";
