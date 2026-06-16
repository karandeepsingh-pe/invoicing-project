-- Technician employment start date (HR record; prefills assignment start). Nullable
-- / additive — safe, non-destructive.
ALTER TABLE "technicians" ADD COLUMN "startDate" DATE;
