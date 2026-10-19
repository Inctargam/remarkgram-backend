/*
  Warnings:

  - A unique constraint covering the columns `[user_id]` on the table `payments` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `type` to the `payments` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "PaymentType" AS ENUM ('PURCHASE', 'RENEWAL');

-- AlterTable
ALTER TABLE "payments" ADD COLUMN "type" "PaymentType";
UPDATE "payments" SET "type" = 'PURCHASE' WHERE "type" IS NULL;
ALTER TABLE "payments" ALTER COLUMN "type" SET NOT NULL;

