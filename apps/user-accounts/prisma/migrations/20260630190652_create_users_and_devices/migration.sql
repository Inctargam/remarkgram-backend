/*
  Warnings:

  - You are about to drop the `User` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropTable
DROP TABLE "User";

-- CreateTable
CREATE TABLE "users" (
    "id" SERIAL NOT NULL,
    "username" VARCHAR NOT NULL,
    "email" VARCHAR NOT NULL,
    "hash" VARCHAR NOT NULL,
    "createdAt" TIMESTAMPTZ NOT NULL,
    "confirmationIsConfirmed" BOOLEAN NOT NULL,
    "confirmationCode" VARCHAR,
    "confirmationExpiration" TIMESTAMPTZ,
    "passwordRecoveryCode" VARCHAR,
    "passwordRecoveryExpiration" TIMESTAMPTZ,
    "deletedAt" TIMESTAMPTZ,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "devices" (
    "id" UUID NOT NULL,
    "userId" INTEGER NOT NULL,
    "name" VARCHAR NOT NULL,
    "ip" VARCHAR NOT NULL,
    "jti" VARCHAR NOT NULL,
    "iat" INTEGER NOT NULL,
    "exp" INTEGER NOT NULL,

    CONSTRAINT "devices_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_username_key" ON "users"("username");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "devices_userId_idx" ON "devices"("userId");

-- AddForeignKey
ALTER TABLE "devices" ADD CONSTRAINT "devices_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;
