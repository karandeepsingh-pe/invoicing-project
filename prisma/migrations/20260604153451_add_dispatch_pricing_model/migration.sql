-- CreateEnum
CREATE TYPE "DispatchPricingModel" AS ENUM ('STANDARD', 'TCS_PRIORITY');

-- AlterTable
ALTER TABLE "client_accounts" ADD COLUMN     "dispatchPricingModel" "DispatchPricingModel" NOT NULL DEFAULT 'STANDARD';
