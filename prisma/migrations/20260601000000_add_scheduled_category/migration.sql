-- Add the SCHEDULED rate category (scheduled visits billed per day off the
-- timesheet, distinct from reactive DISPATCH_SCHED visits). Non-destructive.
ALTER TYPE "RateCategory" ADD VALUE IF NOT EXISTS 'SCHEDULED';
