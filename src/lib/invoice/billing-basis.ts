import { ANNUAL_WORK_HOURS } from "./rebadged-rates";

/** Monthly salary from an annual figure (annual / 12). */
export function monthlyFromAnnual(annual: number | null | undefined): number {
  const amount = annual ?? 0;
  return amount > 0 ? amount / 12 : 0;
}

/**
 * Dedicated FTE day rate for a given month: the monthly salary (annual / 12)
 * spread across the month's business days, so a fully-worked month bills exactly
 * annual / 12. Returns 0 for a non-positive annual or zero business days.
 */
export function dedicatedDayRate(
  annual: number | null | undefined,
  businessDays: number,
): number {
  const amount = annual ?? 0;
  if (amount <= 0 || businessDays <= 0) return 0;
  return amount / 12 / businessDays;
}

/**
 * Bridge a band rate-sheet hourly rate back to an implied annual (hourly × 2080).
 * Used as the fallback when a band only has a legacy hourly day-rate row.
 */
export function annualFromBandHourly(hourly: number | null | undefined): number {
  const h = hourly ?? 0;
  return h > 0 ? h * ANNUAL_WORK_HOURS : 0;
}

/**
 * Resolve a band's dedicated annual salary from its rate-sheet rows. A band may
 * store the salary either as an exact annual (the `ANNUAL_RATE` row) or as a
 * legacy hourly day rate (`MONTHLY_DAY_RATE`, = annual / 2080). Prefer the exact
 * annual; otherwise bridge the hourly back to an implied annual. Returns 0 when
 * neither is present, so the assignment surfaces as unpriced rather than billing $0.
 */
export function pickBandAnnual(
  annualRowAmount: number | null | undefined,
  hourlyRowAmount: number | null | undefined,
): number {
  const annual = annualRowAmount ?? 0;
  if (annual > 0) return annual;
  return annualFromBandHourly(hourlyRowAmount);
}

/**
 * Resolve the per-day rate for a Dedicated FTE line. ANNUAL is the only billing
 * basis (user-confirmed 2026-06-10): the salary spreads as annual / 12 /
 * businessDays, so a fully-worked month bills exactly annual / 12 and partial
 * months scale by daysWorked. Priority:
 *
 *   1. perTechAnnual — a technician-level salary override
 *   2. bandAnnual    — the band ANNUAL_RATE (or legacy hourly × 2080 bridge)
 *
 * The retired DAY_RATE / MONTHLY / HOURLY rate-sheet rows no longer bill; the
 * matrix shows them greyed as "legacy — not billed".
 */
export function resolveDedicatedDayRate(input: {
  perTechAnnual: number;
  bandAnnual: number;
  businessDays: number;
}): number {
  const { perTechAnnual, bandAnnual, businessDays } = input;
  if (perTechAnnual > 0) return dedicatedDayRate(perTechAnnual, businessDays);
  if (bandAnnual > 0) return dedicatedDayRate(bandAnnual, businessDays);
  return 0;
}

/**
 * Per-day rate for a REBADGED technician: their own `annualSalary` through the
 * same annual / 12 / businessDays formula (full override of the account band
 * sheet; OT/weekend bill from the rebadged hourly rates). The legacy rebadged
 * day/monthly/hourly fields no longer bill — a rebadged tech without an annual
 * salary resolves to 0 and surfaces in the unpriced bucket rather than billing
 * silently off a stale flat rate.
 */
export function resolveRebadgedDayRate(input: {
  annual: number;
  businessDays: number;
}): number {
  return dedicatedDayRate(input.annual, input.businessDays);
}
