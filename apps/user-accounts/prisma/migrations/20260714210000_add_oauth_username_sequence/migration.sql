CREATE SEQUENCE "oauth_client_username_seq";

DO $$
DECLARE
  current_max BIGINT;
BEGIN
  SELECT COALESCE(MAX(SUBSTRING("username" FROM '^client([0-9]+)$')::BIGINT), 0)
  INTO current_max
  FROM "users"
  WHERE "username" ~ '^client[0-9]+$';

  IF current_max > 0 THEN
    PERFORM setval('"oauth_client_username_seq"', current_max, TRUE);
  END IF;
END $$;
