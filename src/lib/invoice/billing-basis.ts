// Annual rate basis for a dedicated technician. The monthly entitlement is the
// annual rate / 12, prorated across the month's business days, so the effective
// per-day rate is annual / (12 * businessDays). The FTE Extended Total is then
// dayRate * daysWorked (then + OT + weekend), which equals
//   (Annual / 12) * (DaysWorked / BusinessDays)
// and matches the printed invoices (e.g. annual 74100 over 21 business days, 21
// days worked -> 6175.00). Business days is a per-run input.

/**
 * Effective per-day rate for an annual-basis dedicated technician:
 * annual / (12 * businessDays). Returns 0 for non-positive annual or
 * businessDays so callers render $0 safely.
 */
export function deriveAnnualDayRate(
  annual: number | null | undefined,
  businessDays: number,
): number {
  const amount = annual ?? 0;
  if (amount <= 0 || businessDays <= 0) return 0;
  return amount / (12 * businessDays);
}
