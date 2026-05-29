-- CreateEnum
CREATE TYPE "RateBasis" AS ENUM ('DAY_RATE', 'ANNUAL');

-- AlterTable
ALTER TABLE "client_accounts" ADD COLUMN     "backfillAllowedOverride" BOOLEAN,
ADD COLUMN     "rateBasisOverride" "RateBasis";

-- AlterTable
ALTER TABLE "orgs" ADD COLUMN     "backfillAllowed" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "rateBasis" "RateBasis" NOT NULL DEFAULT 'DAY_RATE';
