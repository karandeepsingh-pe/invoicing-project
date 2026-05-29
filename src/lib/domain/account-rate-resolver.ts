import type { RateCategory } from "@prisma/client";

// A row in the rate matrix is active for `on` when:
//   effectiveFrom <= on  AND  (effectiveTo IS NULL OR on < effectiveTo)
// (effectiveTo is exclusive — matches how billing windows are normally read.)
export function isActiveOn(
  row: { effectiveFrom: Date; effectiveTo: Date | null },
  on: Date,
): boolean {
  const onMs = on.getTime();
  if (row.effectiveFrom.getTime() > onMs) return false;
  if (row.effectiveTo && row.effectiveTo.getTime() <= onMs) return false;
  return true;
}

export type RateWithSubCat<TSub = { rateCategory: RateCategory }> = {
  effectiveFrom: Date;
  effectiveTo: Date | null;
  band: number;
  rateSubCategory: TSub;
};

// Rates a technician of `band` inherits for `category` on the given account/date.
export function ratesForTechnician<R extends RateWithSubCat>(
  rates: R[],
  category: RateCategory,
  band: number,
  on: Date,
): R[] {
  return rates.filter(
    (r) =>
      r.rateSubCategory.rateCategory === category &&
      r.band === band &&
      isActiveOn(r, on),
  );
}

// A rate row's window [effectiveFrom, effectiveTo) overlaps the half-open
// period [start, end) when it begins before the period ends and ends after the
// period begins. (effectiveTo is exclusive.)
export function overlapsRange(
  row: { effectiveFrom: Date; effectiveTo: Date | null },
  start: Date,
  end: Date,
): boolean {
  if (row.effectiveFrom.getTime() >= end.getTime()) return false;
  if (row.effectiveTo && row.effectiveTo.getTime() <= start.getTime()) {
    return false;
  }
  return true;
}

// Rates a technician of `band` inherits for `category` that apply during a
// billing period [start, end) — i.e. their effective window overlaps the
// period. Use this for monthly invoicing where an assignment or rate can begin
// mid-month: anchoring on a single day (e.g. the 1st) would miss a rate that
// only becomes effective later in the month.
//
// Rows are returned sorted by effectiveFrom DESCENDING so callers that pick the
// first match per (sub-category, SLA) get the most recent commercial terms.
export function ratesForTechnicianInRange<R extends RateWithSubCat>(
  rates: R[],
  category: RateCategory,
  band: number,
  start: Date,
  end: Date,
): R[] {
  return rates
    .filter(
      (r) =>
        r.rateSubCategory.rateCategory === category &&
        r.band === band &&
        overlapsRange(r, start, end),
    )
    .sort((a, b) => b.effectiveFrom.getTime() - a.effectiveFrom.getTime());
}
