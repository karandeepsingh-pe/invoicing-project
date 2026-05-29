-- Soft-delete foundation (testing-phase).
--   * deletedAt/deletedById stamps on timesheet_entries, dispatch_visits, coverage_events
--   * swap the full unique indexes for PARTIAL unique indexes scoped to live rows
--     (deletedAt IS NULL) so a day / coverage event can be re-entered after a soft-delete
--   * append-only booking_audit_events table (override + delete-after-invoice + soft-delete)

-- CreateEnum
CREATE TYPE "AuditKind" AS ENUM ('OVERLAP_OVERRIDE', 'DELETE_AFTER_INVOICE', 'SOFT_DELETE');

-- AlterTable: soft-delete stamps
ALTER TABLE "timesheet_entries" ADD COLUMN     "deletedAt" TIMESTAMP(3),
ADD COLUMN     "deletedById" TEXT;

ALTER TABLE "dispatch_visits" ADD COLUMN     "deletedAt" TIMESTAMP(3),
ADD COLUMN     "deletedById" TEXT;

ALTER TABLE "coverage_events" ADD COLUMN     "deletedAt" TIMESTAMP(3),
ADD COLUMN     "deletedById" TEXT;

-- timesheet_entries: full unique -> partial unique on live rows.
DROP INDEX "timesheet_entries_assignmentId_date_key";
CREATE UNIQUE INDEX "timesheet_entries_assignmentId_date_active"
  ON "timesheet_entries" ("assignmentId", "date")
  WHERE "deletedAt" IS NULL;

-- coverage_events: full unique -> partial unique on live rows; keep a plain
-- (coveredAssignmentId, date) lookup index now that the unique is gone.
DROP INDEX "coverage_events_coveredAssignmentId_date_key";
CREATE UNIQUE INDEX "coverage_events_coveredAssignmentId_date_active"
  ON "coverage_events" ("coveredAssignmentId", "date")
  WHERE "deletedAt" IS NULL;
CREATE INDEX "coverage_events_coveredAssignmentId_date_idx"
  ON "coverage_events" ("coveredAssignmentId", "date");

-- CreateTable
CREATE TABLE "booking_audit_events" (
    "id" TEXT NOT NULL,
    "technicianId" TEXT,
    "assignmentId" TEXT,
    "kind" "AuditKind" NOT NULL,
    "detail" JSONB NOT NULL,
    "actorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "booking_audit_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "booking_audit_events_kind_createdAt_idx" ON "booking_audit_events"("kind", "createdAt");
