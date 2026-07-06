DROP INDEX "users_username_key";
DROP INDEX "users_email_key";

CREATE UNIQUE INDEX "users_username_key"
ON "users"("username")
WHERE "deletedAt" IS NULL;

CREATE UNIQUE INDEX "users_email_key"
ON "users"("email")
WHERE "deletedAt" IS NULL;
