-- Dedicated billing basis moves from the account to the technician: a band-2
-- day-rate tech and a band-2 hourly tech can share one account rate card.
ALTER TABLE "technicians"
  ADD COLUMN     "dedicatedBillingBasis" "DedicatedBillingBasis" NOT NULL DEFAULT 'DAY_RATE';
ALTER TABLE "client_accounts"
  DROP COLUMN "dedicatedBillingBasis";
