-- Seed the default plans required by the payments service.
-- A plan is identified by its billing period because the table currently has
-- no unique business key beyond its generated ID.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "plans"
    WHERE ("period_unit", "period_count") IN (
      ('DAY'::"PeriodUnit", 1),
      ('WEEK'::"PeriodUnit", 1),
      ('MONTH'::"PeriodUnit", 1)
    )
    GROUP BY "period_unit", "period_count"
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'Cannot seed default plans: duplicate billing periods exist';
  END IF;
END $$;

UPDATE "plans"
SET "price" = 1000,
    "currency" = 'USD'
WHERE "period_unit" = 'DAY'
  AND "period_count" = 1;

INSERT INTO "plans" ("price", "currency", "period_count", "period_unit")
SELECT 1000, 'USD', 1, 'DAY'
WHERE NOT EXISTS (
  SELECT 1
  FROM "plans"
  WHERE "period_unit" = 'DAY'
    AND "period_count" = 1
);

UPDATE "plans"
SET "price" = 5000,
    "currency" = 'USD'
WHERE "period_unit" = 'WEEK'
  AND "period_count" = 1;

INSERT INTO "plans" ("price", "currency", "period_count", "period_unit")
SELECT 5000, 'USD', 1, 'WEEK'
WHERE NOT EXISTS (
  SELECT 1
  FROM "plans"
  WHERE "period_unit" = 'WEEK'
    AND "period_count" = 1
);

UPDATE "plans"
SET "price" = 10000,
    "currency" = 'USD'
WHERE "period_unit" = 'MONTH'
  AND "period_count" = 1;

INSERT INTO "plans" ("price", "currency", "period_count", "period_unit")
SELECT 10000, 'USD', 1, 'MONTH'
WHERE NOT EXISTS (
  SELECT 1
  FROM "plans"
  WHERE "period_unit" = 'MONTH'
    AND "period_count" = 1
);
