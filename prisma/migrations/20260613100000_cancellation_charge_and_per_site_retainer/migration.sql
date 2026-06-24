-- Additive, nullable columns only — safe on live data.

-- Manual cancellation fee: a CANCELLED visit bills exactly this amount when
-- set; a CANCELLED visit without it is logged but never invoiced.
ALTER TABLE "dispatch_visits" ADD COLUMN "cancellationCharge" DECIMAL(10,2);

-- Per-site recurring fees: invoice generation multiplies an entered site count
-- by these per-site prices into labeled retainer/standby footer lines.
ALTER TABLE "client_accounts" ADD COLUMN "dedicatedRetainerPerSite" DECIMAL(10,2);
ALTER TABLE "client_accounts" ADD COLUMN "dispatchStandbyPerSite" DECIMAL(10,2);
