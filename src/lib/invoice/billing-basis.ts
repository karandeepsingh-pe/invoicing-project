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
 * Resolve the per-day rate for a Dedicated FTE line, choosing the basis from
 * whichever rate sources are present, in priority order:
 *
 *   1. perTechAnnual   — a technician-level salary override (annual / 12 / bd)
 *   2. explicitDayRate — an explicit DAY_RATE row, billed directly per day
 *   3. bandAnnual      — the band ANNUAL_RATE (or legacy hourly × 2080), / 12 / bd
 *   4. monthly         — a MONTHLY row, billed as monthly / bd (= monthly×12 / 12 / bd)
 *
 * This is additive: accounts that only have an ANNUAL_RATE (or per-tech salary)
 * resolve exactly as before, since explicitDayRate / monthly are 0 for them.
 */
export function resolveDedicatedDayRate(input: {
  perTechAnnual: number;
  explicitDayRate: number;
  bandAnnual: number;
  monthly: number;
  businessDays: number;
}): number {
  const { perTechAnnual, explicitDayRate, bandAnnual, monthly, businessDays } = input;
  if (perTechAnnual > 0) return dedicatedDayRate(perTechAnnual, businessDays);
  if (explicitDayRate > 0) return explicitDayRate;
  if (bandAnnual > 0) return dedicatedDayRate(bandAnnual, businessDays);
  if (monthly > 0) return dedicatedDayRate(monthly * 12, businessDays);
  return 0;
}

/**
 * Resolve the per-day rate for a REBADGED technician from their own per-tech rates,
 * in priority order (most specific wins):
 *   1. dayRate     — an explicit per-day rebadged rate, billed directly
 *   2. monthlyRate — billed as monthly / businessDays (full month = monthly)
 *   3. annual      — the annual override, annual / 12 / businessDays (current behavior)
 *   4. hourlyRate  — hourly × the account's Default Hours
 *
 * When only `annual` is set (today's data), this returns exactly
 * dedicatedDayRate(annual, businessDays), so existing rebadged techs are unchanged.
 */
export function resolveRebadgedDayRate(input: {
  dayRate: number;
  monthlyRate: number;
  annual: number;
  hourlyRate: number;
  defaultHours: number;
  businessDays: number;
}): number {
  const { dayRate, monthlyRate, annual, hourlyRate, defaultHours, businessDays } = input;
  if (dayRate > 0) return dayRate;
  if (monthlyRate > 0) return dedicatedDayRate(monthlyRate * 12, businessDays);
  if (annual > 0) return dedicatedDayRate(annual, businessDays);
  if (hourlyRate > 0 && defaultHours > 0) return hourlyRate * defaultHours;
  return 0;
}
