-- Technician pool availability flags (opt-in). Existing technicians default to
-- false on every flag: they must be explicitly flagged before appearing in a
-- new-assignment picker. Existing assignments and timesheet/visit entry are
-- unaffected (those read assignments, not these flags).

ALTER TABLE "technicians" ADD COLUMN     "isAvailableForDedicated" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "isAvailableForProject" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "isAvailableForDispatch" BOOLEAN NOT NULL DEFAULT false;
