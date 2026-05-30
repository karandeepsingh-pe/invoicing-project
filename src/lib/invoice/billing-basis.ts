import { ANNUAL_WORK_HOURS } from "./rebadged-rates";

// Annual figures are a data-entry convenience only: an annual amount converts to
// an hourly rate by dividing across standard annual work hours (2080 = 40h x 52w),
// the same divisor used for rebadged technicians. Billing itself is hourly.
export function annualToHourly(annual: number | null | undefined): number {
  const amount = annual ?? 0;
  if (amount <= 0) return 0;
  return amount / ANNUAL_WORK_HOURS;
}

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
 * Used as the fallback when a technician has no per-tech annual rate set.
 */
export function annualFromBandHourly(hourly: number | null | undefined): number {
  const h = hourly ?? 0;
  return h > 0 ? h * ANNUAL_WORK_HOURS : 0;
}
