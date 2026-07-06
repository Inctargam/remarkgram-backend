UPDATE "users"
SET "confirmationCode" = NULL,
    "confirmationExpiration" = NULL
WHERE "isConfirmed" = TRUE;
