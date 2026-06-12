// Dispatch pricing PROFILES — the config seam that makes the dispatch engine
// reusable across client formats. A profile is a pure bag of knobs the dispatch
// calculator reads; adding a new client format means adding a profile + that
// client's rate sheet, with NO new calculator code.
//
// The string keys match the Prisma `DispatchPricingModel` enum values, so an
// account's `dispatchPricingModel` maps straight to a profile via `profileFor`.

import { DISPATCH_BAND } from "@/lib/domain/rate-dimensions";

export type HoursRounding = "none" | "nearest_half_min1";
export type DispatchRateKey = "band_sla" | "priority";

export type DispatchPricingProfile = {
  // How onsite hours convert to billable hours before charging.
  //   none               -> use the raw hours (JLL)
  //   nearest_half_min1  -> round to the nearest 0.5 (half up), floor at 1.0 (TCS)
  hoursRounding: HoursRounding;
  // Hours already covered by the first-hour charge; only hours beyond this add the
  // additional rate. JLL = 1 (first hour included), TCS = 2 (first two hours).
  freeHoursIncluded: number;
  // Apply a FULL_DAY cap on the base when a FULL_DAY rate is present.
  fullDayCap: boolean;
  // Which rate-sheet dimension keys the lookup:
  //   band_sla  -> (technician band, visit SLA)            [JLL]
  //   priority  -> (visit SLA used as the priority tier)   [TCS]; band ignored
  rateKey: DispatchRateKey;
  // The band the band_sla lookup keys on. Dispatch rates are stored flat at
  // DISPATCH_BAND (2) regardless of the technician's own band, so the lookup must
  // use this fixed band — not the tech's band — or off-band techs would silently
  // resolve to $0. Ignored by the priority path (which ignores band entirely).
  rateBand: number;
  // First-hour-charge multipliers for weekend scenarios (TCS rate card: weekend
  // x1.5, weekend-after-hours x2). null = no multiplier (the band_sla path uses
  // its own legacy uplift instead and ignores these).
  weekendFirstHourMultiplier: number | null;
  weekendAfterFirstHourMultiplier: number | null;
  // Treat a Saturday/Sunday visit date (or a public holiday) as a weekend for
  // pricing. JLL does; TCS bills weekends only when the visit is explicitly flagged
  // (its tracker carries a separate weekend column), so the calendar must not leak in.
  autoWeekendFromDate: boolean;
};

// JLL and every existing account: exactly today's behavior. Chosen so the
// band_sla branch of the calculator reproduces its current output byte for byte.
export const STANDARD_PROFILE: DispatchPricingProfile = {
  hoursRounding: "none",
  freeHoursIncluded: 1,
  fullDayCap: true,
  rateKey: "band_sla",
  rateBand: DISPATCH_BAND,
  weekendFirstHourMultiplier: null,
  weekendAfterFirstHourMultiplier: null,
  autoWeekendFromDate: true,
};

// TCS (end client Hertz): priority-keyed first-hour charge, first two hours
// included, additional billed by scenario, hours rounded to the nearest 0.5
// (min 1), no full-day cap, weekend first-hour x1.5 / weekend-after x2, and a
// cancelled visit bills the priority first-hour charge.
export const TCS_PRIORITY_PROFILE: DispatchPricingProfile = {
  hoursRounding: "nearest_half_min1",
  freeHoursIncluded: 2,
  fullDayCap: false,
  rateKey: "priority",
  rateBand: DISPATCH_BAND,
  weekendFirstHourMultiplier: 1.5,
  weekendAfterFirstHourMultiplier: 2,
  autoWeekendFromDate: false,
};

const PROFILES: Record<string, DispatchPricingProfile> = {
  STANDARD: STANDARD_PROFILE,
  TCS_PRIORITY: TCS_PRIORITY_PROFILE,
};

/** Resolve an account's dispatch pricing model to its profile (defaults to STANDARD). */
export function profileFor(model: string | null | undefined): DispatchPricingProfile {
  return (model && PROFILES[model]) || STANDARD_PROFILE;
}
