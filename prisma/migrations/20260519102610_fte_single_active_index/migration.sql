-- Enforce: at most one active (endDate IS NULL) FTE assignment per technician.
-- Application layer must also enforce this on write (see CLAUDE.md).
CREATE UNIQUE INDEX "assignment_fte_single_active"
  ON "assignments" ("technicianId")
  WHERE "endDate" IS NULL AND "techType" = 'FTE';
