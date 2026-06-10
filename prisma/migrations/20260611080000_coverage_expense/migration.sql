-- Backfill expenses (2026-06-11): optional pass-through expense paid to the
-- covering technician (travel etc.), billed to the client under the
-- pre-invoice footer's Reimbursements. Additive only.
ALTER TABLE "coverage_events" ADD COLUMN "expenseAmount" DECIMAL(12,2);
ALTER TABLE "coverage_events" ADD COLUMN "expenseNotes" TEXT;
