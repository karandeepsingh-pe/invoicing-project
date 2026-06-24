import { RateCategory } from "@prisma/client";

// Dispatch rates are flat per SLA (stored at this band).
export const DISPATCH_BAND = 2;

// Technician bands used as the rate-matrix columns for non-dispatch categories.
export const BANDS = [0, 1, 2, 3, 4] as const;

// Dispatch on-site response SLAs, in display order (the dispatch matrix columns).
export const dispatchSlaCodes = [
  "24X7X4",
  "24X7X8",
  "8X5X4",
  "8X5X6",
  "9X5X4",
  "NBD",
  "SBD",
  "2BD",
  "3BD",
  "4BD",
  "5BD",
  "6BD",
  "7BD",
  "8BD",
  "9BD",
  "10BD",
  "11BD",
  "12BD",
  "13BD",
  "14BD",
  "15BD",
] as const;

// Dedicated prices per band under a backfill tier; rebadged rows sit under NA.
const DEDICATED_SLA_CODES = ["BACKFILL", "NO_BACKFILL", "NA"] as const;
// Project / Scheduled have no SLA dimension in the sheet; rows sit under SCHEDULE / NA.
const NON_DISPATCH_SLA_CODES = ["SCHEDULE", "NA"] as const;

/** SLA codes that apply to a rate category (single source of truth for the rate UI). */
export function slaCodesForCategory(category: RateCategory): string[] {
  switch (category) {
    case RateCategory.DISPATCH_SCHED:
      return [...dispatchSlaCodes];
    case RateCategory.DEDICATED:
      return [...DEDICATED_SLA_CODES];
    default:
      return [...NON_DISPATCH_SLA_CODES];
  }
}
