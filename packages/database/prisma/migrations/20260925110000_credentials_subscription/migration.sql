-- CreateEnum
CREATE TYPE "CompanyStatus" AS ENUM ('PENDING', 'ACTIVE', 'BLOCKED');

-- AlterTable
ALTER TABLE "companies" ADD COLUMN     "name_key" VARCHAR(200),
ADD COLUMN     "paid_until" TIMESTAMPTZ(3),
ADD COLUMN     "status" "CompanyStatus" NOT NULL DEFAULT 'ACTIVE';

-- AlterTable
ALTER TABLE "memberships" ADD COLUMN     "login" VARCHAR(64),
ADD COLUMN     "password_hash" VARCHAR(255);

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "email" VARCHAR(254),
ADD COLUMN     "password_hash" VARCHAR(255);

-- CreateIndex
CREATE UNIQUE INDEX "companies_name_key_key" ON "companies"("name_key");

-- CreateIndex
CREATE UNIQUE INDEX "memberships_company_id_login_key" ON "memberships"("company_id", "login");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");


-- Существующие компании: ключ названия для входа сотрудников (только если название уникально)
UPDATE "companies" c SET "name_key" = lower(btrim(c."name"))
WHERE (SELECT count(*) FROM "companies" c2 WHERE lower(btrim(c2."name")) = lower(btrim(c."name"))) = 1;
