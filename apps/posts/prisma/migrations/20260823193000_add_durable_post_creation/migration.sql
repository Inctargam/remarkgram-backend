ALTER TABLE "posts" ADD COLUMN "published_at" TIMESTAMPTZ;

-- Все посты, созданные до внедрения workflow, уже опубликованы.
UPDATE "posts"
SET "published_at" = "created_at";
