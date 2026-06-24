-- Dispatch auto-split business-hours window (wall-clock "HH:mm"), nullable.
-- Both NULL = auto-split off; existing accounts (and the JLL/TCS fixtures) keep
-- the original single-scenario dispatch behavior.
ALTER TABLE "client_accounts" ADD COLUMN     "businessHoursStart" TEXT;
ALTER TABLE "client_accounts" ADD COLUMN     "businessHoursEnd" TEXT;
