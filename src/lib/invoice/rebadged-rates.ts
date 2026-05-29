// Rebadged technician billing: rates derive from the annual salary, not the
// account rate sheet. Standard basis: 40 hrs/week × 52 weeks = 2080 hrs/year.

export const ANNUAL_WORK_HOURS = 2080;

export type RebadgedRates = { hourly: number; dayRate: number };

/**
 * Derive a rebadged technician's bill rates from their annual salary.
 *   hourly  = annualSalary / 2080
 *   dayRate = hourly × defaultHours (the account's working-day length)
 * Returns zeros when no/zero salary so callers can render "—" / $0 safely.
 */
export function deriveRebadgedRates(
  annualSalary: number | null | undefined,
  defaultHours: number,
): RebadgedRates {
  const salary = annualSalary ?? 0;
  if (salary <= 0) return { hourly: 0, dayRate: 0 };
  const hourly = salary / ANNUAL_WORK_HOURS;
  return { hourly, dayRate: hourly * defaultHours };
}
