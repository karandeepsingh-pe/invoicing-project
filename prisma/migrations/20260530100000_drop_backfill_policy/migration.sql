-- Drop the per-org / per-account backfill policy. Backfill is now a technician
-- trait (Technician.defaultSlaTier), which seeds each assignment's slaTier, so
-- these policy columns are no longer used anywhere.
ALTER TABLE "orgs" DROP COLUMN "backfillAllowed";
ALTER TABLE "client_accounts" DROP COLUMN "backfillAllowedOverride";
