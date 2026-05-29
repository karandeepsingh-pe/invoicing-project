-- AlterTable: per-account Default Hours used for FTE timesheet pre-fill + OT split.
ALTER TABLE "client_accounts" ADD COLUMN "defaultHours" INTEGER NOT NULL DEFAULT 8;

ALTER TABLE "client_accounts"
  ADD CONSTRAINT "client_accounts_defaultHours_check"
  CHECK ("defaultHours" >= 1 AND "defaultHours" <= 24);
