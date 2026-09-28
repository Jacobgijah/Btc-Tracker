-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('ADMIN', 'USER');

-- AlterTable: add role/isActive to User (both have defaults, no backfill needed)
ALTER TABLE "User"
  ADD COLUMN "isActive" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "role" "UserRole" NOT NULL DEFAULT 'USER';

-- AlterTable: add userId to Transaction, nullable first so existing rows survive
ALTER TABLE "Transaction" ADD COLUMN "userId" INTEGER;

-- Backfill: every existing transaction belongs to the oldest (bootstrap) user
UPDATE "Transaction" SET "userId" = (SELECT id FROM "User" ORDER BY id LIMIT 1);

ALTER TABLE "Transaction" ALTER COLUMN "userId" SET NOT NULL;

-- CreateIndex
CREATE INDEX "Transaction_userId_idx" ON "Transaction"("userId");

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AlterTable: re-key Setting from a global (key) singleton to per-user (userId, key)
ALTER TABLE "Setting" DROP CONSTRAINT "Setting_pkey";
ALTER TABLE "Setting" ADD COLUMN "userId" INTEGER;

-- Backfill: existing global settings become the bootstrap user's settings
UPDATE "Setting" SET "userId" = (SELECT id FROM "User" ORDER BY id LIMIT 1);

ALTER TABLE "Setting" ALTER COLUMN "userId" SET NOT NULL;
ALTER TABLE "Setting" ADD CONSTRAINT "Setting_pkey" PRIMARY KEY ("userId", "key");

-- AddForeignKey
ALTER TABLE "Setting" ADD CONSTRAINT "Setting_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
