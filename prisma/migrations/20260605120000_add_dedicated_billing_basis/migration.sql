-- Dedicated billing basis: DAY_RATE (default, current behavior) or HOURLY.
CREATE TYPE "DedicatedBillingBasis" AS ENUM ('DAY_RATE', 'HOURLY');
ALTER TABLE "client_accounts"
  ADD COLUMN     "dedicatedBillingBasis" "DedicatedBillingBasis" NOT NULL DEFAULT 'DAY_RATE';
