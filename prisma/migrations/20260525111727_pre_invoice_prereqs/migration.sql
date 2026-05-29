-- CreateEnum
CREATE TYPE "TimesheetDayStatus" AS ENUM ('PH', 'AB', 'NA');

-- AlterTable: ClientAccount header fields for pre-invoice generation
ALTER TABLE "client_accounts" ADD COLUMN "clientPocName" TEXT;
ALTER TABLE "client_accounts" ADD COLUMN "clientSpocEmail" TEXT;
ALTER TABLE "client_accounts" ADD COLUMN "projectDescription" TEXT;

-- AlterTable: Assignment backfill label (rate-neutral)
ALTER TABLE "assignments" ADD COLUMN "backfill" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable: TimesheetEntry status code (PH/AB/NA)
ALTER TABLE "timesheet_entries" ADD COLUMN "status" "TimesheetDayStatus";
