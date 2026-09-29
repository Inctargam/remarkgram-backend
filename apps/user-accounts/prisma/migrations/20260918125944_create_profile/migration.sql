-- CreateTable
CREATE TABLE "profiles" (
    "user_id" INTEGER NOT NULL,
    "first_name" VARCHAR,
    "last_name" VARCHAR,
    "avatar_file_id" UUID,
    "date_of_birth" DATE,
    "about_me" VARCHAR,
    "country_code" VARCHAR,
    "city" VARCHAR,

    CONSTRAINT "profiles_pkey" PRIMARY KEY ("user_id")
);

-- AddForeignKey
ALTER TABLE "profiles" ADD CONSTRAINT "profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
