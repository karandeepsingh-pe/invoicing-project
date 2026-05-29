-- AlterEnum
ALTER TYPE "MiscFeeKind" ADD VALUE 'PROJECT_MANAGEMENT';

-- AlterTable
ALTER TABLE "misc_fees" ADD COLUMN     "percent" DECIMAL(6,4);
