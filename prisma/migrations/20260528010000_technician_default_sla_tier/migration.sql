-- Tech-level backfill trait. Dedicated FTE rates split by backfill tier
-- (BACKFILL vs NO_BACKFILL AccountRate rows); this rides on the technician and
-- seeds the slaTier of any assignment they take. NONE for non-Dedicated techs.
-- The "AssignmentSlaTier" enum already exists (added in 20260525121853_multi_invoice_types).
ALTER TABLE "technicians"
  ADD COLUMN "defaultSlaTier" "AssignmentSlaTier" NOT NULL DEFAULT 'NONE';
