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
