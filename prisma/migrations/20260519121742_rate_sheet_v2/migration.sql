/*
  Warnings:

  - You are about to drop the column `techType` on the `assignments` table. All the data in the column will be lost.
  - You are about to drop the column `name` on the `technicians` table. All the data in the column will be lost.
  - You are about to drop the column `primaryType` on the `technicians` table. All the data in the column will be lost.
  - You are about to drop the `rate_cards` table. If the table is not empty, all the data it contains will be lost.
  - Added the required column `rateCategory` to the `assignments` table without a default value. This is not possible if the table is not empty.
  - Added the required column `band` to the `technicians` table without a default value. This is not possible if the table is not empty.
  - Added the required column `firstName` to the `technicians` table without a default value. This is not possible if the table is not empty.
  - Added the required column `lastName` to the `technicians` table without a default value. This is not possible if the table is not empty.
  - Added the required column `primaryCategory` to the `technicians` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "RateCategory" AS ENUM ('DEDICATED', 'PROJECT_TM', 'DISPATCH_SCHED');

-- CreateEnum
CREATE TYPE "MiscFeeKind" AS ENUM ('MISCELLANEOUS_PRICES', 'RETAINER_FEES', 'MILEAGE', 'BGV_COST', 'PER_DIEM', 'TOOLKIT', 'ACCOUNT_SPECIFIC', 'OTHER');

-- DropIndex: old FTE single-active partial index references techType which is being dropped.
DROP INDEX IF EXISTS "assignment_fte_single_active";

-- DropForeignKey
ALTER TABLE "rate_cards" DROP CONSTRAINT "rate_cards_clientAccountId_fkey";

-- AlterTable
ALTER TABLE "assignments" DROP COLUMN "techType",
ADD COLUMN     "rateCategory" "RateCategory" NOT NULL;

-- AlterTable
ALTER TABLE "technicians" DROP COLUMN "name",
DROP COLUMN "primaryType",
ADD COLUMN     "band" INTEGER NOT NULL,
ADD COLUMN     "firstName" TEXT NOT NULL,
ADD COLUMN     "lastName" TEXT NOT NULL,
ADD COLUMN     "primaryCategory" "RateCategory" NOT NULL;

-- DropTable
DROP TABLE "rate_cards";

-- DropEnum
DROP TYPE "RateUnit";

-- DropEnum
DROP TYPE "TechType";

-- CreateTable
CREATE TABLE "slas" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "slas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rate_sub_categories" (
    "id" TEXT NOT NULL,
    "rateCategory" "RateCategory" NOT NULL,
    "code" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isOvertimeVariant" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "rate_sub_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "account_rates" (
    "id" TEXT NOT NULL,
    "clientAccountId" TEXT NOT NULL,
    "rateSubCategoryId" TEXT NOT NULL,
    "band" INTEGER NOT NULL,
    "slaId" TEXT NOT NULL,
    "rateAmount" DECIMAL(12,4),
    "effectiveFrom" DATE NOT NULL,
    "effectiveTo" DATE,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "account_rates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "misc_fees" (
    "id" TEXT NOT NULL,
    "clientAccountId" TEXT NOT NULL,
    "kind" "MiscFeeKind" NOT NULL,
    "label" TEXT NOT NULL,
    "amount" DECIMAL(12,2),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "misc_fees_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "slas_code_key" ON "slas"("code");

-- CreateIndex
CREATE UNIQUE INDEX "rate_sub_categories_rateCategory_code_key" ON "rate_sub_categories"("rateCategory", "code");

-- CreateIndex
CREATE INDEX "account_rates_clientAccountId_rateSubCategoryId_idx" ON "account_rates"("clientAccountId", "rateSubCategoryId");

-- CreateIndex
CREATE INDEX "account_rates_clientAccountId_band_idx" ON "account_rates"("clientAccountId", "band");

-- CreateIndex
CREATE UNIQUE INDEX "account_rates_clientAccountId_rateSubCategoryId_band_slaId__key" ON "account_rates"("clientAccountId", "rateSubCategoryId", "band", "slaId", "effectiveFrom");

-- CreateIndex
CREATE INDEX "misc_fees_clientAccountId_idx" ON "misc_fees"("clientAccountId");

-- CreateIndex
CREATE INDEX "technicians_primaryCategory_band_idx" ON "technicians"("primaryCategory", "band");

-- AddForeignKey
ALTER TABLE "account_rates" ADD CONSTRAINT "account_rates_clientAccountId_fkey" FOREIGN KEY ("clientAccountId") REFERENCES "client_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "account_rates" ADD CONSTRAINT "account_rates_rateSubCategoryId_fkey" FOREIGN KEY ("rateSubCategoryId") REFERENCES "rate_sub_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "account_rates" ADD CONSTRAINT "account_rates_slaId_fkey" FOREIGN KEY ("slaId") REFERENCES "slas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "misc_fees" ADD CONSTRAINT "misc_fees_clientAccountId_fkey" FOREIGN KEY ("clientAccountId") REFERENCES "client_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Re-create partial unique index: at most one active (endDate IS NULL) DEDICATED
-- assignment per technician (formerly the FTE single-active rule). The application
-- layer must also enforce this on write.
CREATE UNIQUE INDEX "assignment_dedicated_single_active"
  ON "assignments" ("technicianId")
  WHERE "endDate" IS NULL AND "rateCategory" = 'DEDICATED';
