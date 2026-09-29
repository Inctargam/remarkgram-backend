-- CreateIndex
CREATE INDEX "posts_author_created_id_active_idx" ON "posts"("author_id", "created_at" DESC, "id" DESC) WHERE ("deleted_at" IS NULL);
