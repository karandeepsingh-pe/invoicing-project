-- Rebadged technicians: billed off annual salary (hourly = salary/2080, day = hourly ×
-- Default Hours) instead of the band rate sheet. OT/weekend hourly rates manual.
-- All additive/nullable; isRebadged defaults false so existing techs are unaffected.

ALTER TABLE "technicians" ADD COLUMN     "isRebadged" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "annualSalary" DECIMAL(12,2),
ADD COLUMN     "rebadgedOtRate" DECIMAL(12,4),
ADD COLUMN     "rebadgedWeekendRate" DECIMAL(12,4);
