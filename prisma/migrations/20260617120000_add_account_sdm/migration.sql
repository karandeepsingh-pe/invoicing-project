-- Per-account SDM owner. Drives row-level visibility: an SDM sees an account
-- when sdmEmail matches their signed-in email (case-insensitive). Nullable +
-- no backfill — existing accounts stay admin-only until an owner is assigned.
ALTER TABLE "client_accounts" ADD COLUMN "sdmName" TEXT;
ALTER TABLE "client_accounts" ADD COLUMN "sdmEmail" TEXT;
ALTER TABLE "client_accounts" ADD COLUMN "sdmPhone" TEXT;

CREATE INDEX "client_accounts_sdmEmail_idx" ON "client_accounts" ("sdmEmail");
