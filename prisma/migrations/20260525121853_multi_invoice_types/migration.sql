-- CreateEnum
CREATE TYPE "AssignmentSlaTier" AS ENUM ('BACKFILL', 'NO_BACKFILL', 'NONE');

-- AlterTable: Assignment.backfill (Boolean) -> Assignment.slaTier (enum)
ALTER TABLE "assignments" ADD COLUMN "slaTier" "AssignmentSlaTier" NOT NULL DEFAULT 'NONE';

-- Carry forward existing backfill flag to slaTier for DEDICATED rows only.
UPDATE "assignments"
SET "slaTier" = CASE
  WHEN "backfill" = true THEN 'BACKFILL'::"AssignmentSlaTier"
  ELSE 'NO_BACKFILL'::"AssignmentSlaTier"
END
WHERE "rateCategory" = 'DEDICATED';

ALTER TABLE "assignments" DROP COLUMN "backfill";

-- Seed BACKFILL / NO_BACKFILL Sla rows. Idempotent via ON CONFLICT.
INSERT INTO "slas" ("id", "code", "label", "sortOrder") VALUES
  ('sla_backfill_seed', 'BACKFILL', 'Backfill (replacement guaranteed)', 100),
  ('sla_no_backfill_seed', 'NO_BACKFILL', 'No Backfill', 110)
ON CONFLICT ("code") DO NOTHING;

-- Rename Dedicated sub-cats to tier-neutral codes
UPDATE "rate_sub_categories"
SET "code" = 'MONTHLY_DAY_RATE', "label" = 'Monthly Day Rate'
WHERE "rateCategory" = 'DEDICATED' AND "code" = 'ANNUAL_BACKFILL';

UPDATE "rate_sub_categories"
SET "code" = 'OT_HOURLY_RATE', "label" = 'OT Hourly Rate'
WHERE "rateCategory" = 'DEDICATED' AND "code" = 'HOURLY_BACKFILL_OT';

UPDATE "rate_sub_categories"
SET "code" = 'WEEKEND_HOURLY_RATE', "label" = 'Weekend Hourly Rate'
WHERE "rateCategory" = 'DEDICATED' AND "code" = 'HOURLY_BACKFILL_WEEKEND';

-- Auto-migrate existing Dedicated AccountRate rows to BACKFILL slaId.
-- Treats current data as backfill tier (the implicit historical default).
UPDATE "account_rates"
SET "slaId" = (SELECT "id" FROM "slas" WHERE "code" = 'BACKFILL' LIMIT 1)
WHERE "rateSubCategoryId" IN (
  SELECT "id" FROM "rate_sub_categories" WHERE "rateCategory" = 'DEDICATED'
);

-- CreateTable: dispatch_visits
CREATE TABLE "dispatch_visits" (
    "id" TEXT NOT NULL,
    "assignmentId" TEXT NOT NULL,
    "visitDate" DATE NOT NULL,
    "ticketNumber" TEXT,
    "hoursOnSite" DECIMAL(6,2) NOT NULL,
    "afterHours" BOOLEAN NOT NULL DEFAULT false,
    "weekend" BOOLEAN NOT NULL DEFAULT false,
    "slaId" TEXT NOT NULL,
    "notes" TEXT,
    "enteredById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "dispatch_visits_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "dispatch_visits_assignmentId_visitDate_idx" ON "dispatch_visits"("assignmentId", "visitDate");

ALTER TABLE "dispatch_visits" ADD CONSTRAINT "dispatch_visits_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "assignments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "dispatch_visits" ADD CONSTRAINT "dispatch_visits_slaId_fkey" FOREIGN KEY ("slaId") REFERENCES "slas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "dispatch_visits" ADD CONSTRAINT "dispatch_visits_enteredById_fkey" FOREIGN KEY ("enteredById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CreateTable: coverage_events
CREATE TABLE "coverage_events" (
    "id" TEXT NOT NULL,
    "coveredAssignmentId" TEXT NOT NULL,
    "coveringAssignmentId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "hours" DECIMAL(6,2) NOT NULL,
    "notes" TEXT,
    "enteredById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "coverage_events_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "coverage_events_coveredAssignmentId_date_key" ON "coverage_events"("coveredAssignmentId", "date");
CREATE INDEX "coverage_events_coveringAssignmentId_date_idx" ON "coverage_events"("coveringAssignmentId", "date");

ALTER TABLE "coverage_events" ADD CONSTRAINT "coverage_events_coveredAssignmentId_fkey" FOREIGN KEY ("coveredAssignmentId") REFERENCES "assignments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "coverage_events" ADD CONSTRAINT "coverage_events_coveringAssignmentId_fkey" FOREIGN KEY ("coveringAssignmentId") REFERENCES "assignments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "coverage_events" ADD CONSTRAINT "coverage_events_enteredById_fkey" FOREIGN KEY ("enteredById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
