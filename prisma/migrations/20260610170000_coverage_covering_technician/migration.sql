-- Technician-based coverage (2026-06-10): the covering side of a backfill
-- event becomes a TECHNICIAN reference (any active pool tech — no account
-- assignment needed); the legacy assignment reference goes nullable and is
-- kept only for rollback. Zero coverage rows exist at migration time.
ALTER TABLE "coverage_events" ALTER COLUMN "coveringAssignmentId" DROP NOT NULL;

ALTER TABLE "coverage_events" ADD COLUMN "coveringTechnicianId" TEXT;

ALTER TABLE "coverage_events"
  ADD CONSTRAINT "coverage_events_coveringTechnicianId_fkey"
  FOREIGN KEY ("coveringTechnicianId") REFERENCES "technicians"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "coverage_events_coveringTechnicianId_date_idx"
  ON "coverage_events"("coveringTechnicianId", "date");
