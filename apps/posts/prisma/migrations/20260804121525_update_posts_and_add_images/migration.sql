/*
  Warnings:

  - You are about to drop the column `content` on the `posts` table. All the data in the column will be lost.
  - You are about to drop the column `title` on the `posts` table. All the data in the column will be lost.
  - Made the column `author_id` on table `posts` required. This step will fail if there are existing NULL values in that column.

*/
-- AlterTable
ALTER TABLE "posts" DROP COLUMN "content",
DROP COLUMN "title",
ADD COLUMN     "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "description" TEXT,
ALTER COLUMN "author_id" SET NOT NULL;

-- CreateTable
CREATE TABLE "post_images" (
    "file_id" UUID NOT NULL,
    "post_id" INTEGER NOT NULL,
    "position" INTEGER NOT NULL,

    CONSTRAINT "post_images_pkey" PRIMARY KEY ("file_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "post_images_post_id_position_key" ON "post_images"("post_id", "position");

-- AddForeignKey
ALTER TABLE "post_images" ADD CONSTRAINT "post_images_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
