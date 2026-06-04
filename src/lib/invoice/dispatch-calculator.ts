// Dispatch / Schedule Visit pre-invoice math.
//
// Per-visit billing. No backfill semantics — Dispatch does not import
// coverage logic. Rate lookup keys on (band, slaId of the visit).
//
// Each visit falls into one billing SCENARIO based on its flags:
//   WEEKEND  when weekend or public holiday
//   OOB      when after-hours (and not weekend/PH)
//   BUSINESS otherwise
//
// EXPLICIT (preferred) — the rate sheet carries a per-scenario rate set. These
// already price the scenario, so no multiplier is applied on top:
//   per-ticket flat:  PER_TICKET_BUSINESS / PER_TICKET_OOB   (none for weekend)
//   first hour:       FIRST_HOUR / FIRST_HOUR_OOB / FIRST_HOUR_WEEKEND
//   additional hour:  ADDITIONAL_HOUR / ADDITIONAL_HOUR_OOB / ADDITIONAL_HOUR_WEEKEND
//   base   = firstHour + max(0, hours - 1) × additionalHour
//   base   = min(base, FULL_DAY)            when a full-day cap is set
//   charge = round2(base)                   (per-ticket flat bypasses this)
//
// LEGACY (fallback) — when the scenario-specific first/additional rates are not
// set, the OOB / weekend scenarios reuse the BUSINESS first/additional rates and
// apply a multiplier:
//   charge = round2(min(base, FULL_DAY) × uplift), uplift =
//            WEEKEND_PH_MULTIPLIER (default 2.0)  weekend / PH
//            OOBH_MULTIPLIER       (default 1.5)  after-hours
//            1.0                                  business
// A generic PER_TICKET rate is a flat per-visit charge bypassing everything.
// BUSINESS visits price identically under both paths (uplift 1.0).

import { Prisma } from "@prisma/client";
import {
  STANDARD_PROFILE,
  type DispatchPricingProfile,
} from "./dispatch-pricing-profiles";

const Decimal = Prisma.Decimal;
type DecimalLike = InstanceType<typeof Decimal>;

// SOW-standard uplifts, used when the rate sheet does not override them.
const DEFAULT_OOBH_MULTIPLIER = new Decimal("1.5");
const DEFAULT_WEEKEND_PH_MULTIPLIER = new Decimal("2.0");

type Scenario = "BUSINESS" | "OOB" | "WEEKEND";

// Scenario -> the explicit sub-category codes that price it.
const SCENARIO_CODES: Record<
  Scenario,
  { perTicket: string | null; first: string; additional: string; multiplier: string | null }
> = {
  BUSINESS: { perTicket: "PER_TICKET_BUSINESS", first: "FIRST_HOUR", additional: "ADDITIONAL_HOUR", multiplier: null },
  OOB: { perTicket: "PER_TICKET_OOB", first: "FIRST_HOUR_OOB", additional: "ADDITIONAL_HOUR_OOB", multiplier: "OOBH_MULTIPLIER" },
  WEEKEND: { perTicket: null, first: "FIRST_HOUR_WEEKEND", additional: "ADDITIONAL_HOUR_WEEKEND", multiplier: "WEEKEND_PH_MULTIPLIER" },
};

export type DispatchRateRow = {
  rateAmount: DecimalLike | null;
  band: number;
  rateSubCategory: { code: string };
  sla: { code: string };
};

export type DispatchVisitInput = {
  id: string;
  visitDate: Date;
  ticketNumber: string | null;
  hoursOnSite: DecimalLike;
  afterHours: boolean;
  weekend: boolean;
  isPublicHoliday: boolean;
  slaCode: string;
  technicianName: string;
  technicianBand: number;
  location: string;
  notes: string | null;
};

export type DispatchRow = {
  visitId: string;
  visitDate: Date;
  ticketNumber: string | null;
  technicianName: string;
  technicianBand: number;
  location: string;
  slaCode: string;
  hoursOnSite: number;
  firstHourRate: number;
  additionalHourRate: number;
  charge: number;
  modifiersApplied: string[];
  notes: string | null;
};

const ZERO = new Decimal(0);

function pick(
  rates: DispatchRateRow[],
  band: number,
  slaCode: string,
  subCatCode: string,
): DecimalLike {
  const row = rates.find(
    (r) =>
      r.band === band &&
      r.sla.code === slaCode &&
      r.rateSubCategory.code === subCatCode,
  );
  if (!row || row.rateAmount === null) return ZERO;
  return new Decimal(row.rateAmount.toString());
}

/** Find a priority-keyed rate (band ignored): matches on (sla.code = priority, subcat). */
function pickPriority(rates: DispatchRateRow[], priorityCode: string, subCatCode: string): DecimalLike {
  const row = rates.find(
    (r) => r.sla.code === priorityCode && r.rateSubCategory.code === subCatCode,
  );
  if (!row || row.rateAmount === null) return ZERO;
  return new Decimal(row.rateAmount.toString());
}

/** Convert raw onsite hours to billable hours per the profile's rounding rule. */
function roundHours(hours: DecimalLike, profile: DispatchPricingProfile): DecimalLike {
  if (profile.hoursRounding === "nearest_half_min1") {
    // Round to the nearest 0.5 (half up), then floor at 1.0.
    const r = hours.times(2).toDecimalPlaces(0, Decimal.ROUND_HALF_UP).dividedBy(2);
    return r.lessThan(1) ? new Decimal(1) : r;
  }
  return hours;
}

export function calculateDispatchVisit(
  visit: DispatchVisitInput,
  rates: DispatchRateRow[],
  profile: DispatchPricingProfile = STANDARD_PROFILE,
): DispatchRow {
  return profile.rateKey === "priority"
    ? calcPriority(visit, rates, profile)
    : calcBandSla(visit, rates, profile);
}

// Scenario -> the explicit additional-hour code for the priority model.
const PRIORITY_ADDITIONAL_CODE: Record<Scenario | "WEEKEND_AFTER", string> = {
  BUSINESS: "ADDITIONAL_HOUR",
  OOB: "ADDITIONAL_HOUR_OOB",
  WEEKEND: "ADDITIONAL_HOUR_WEEKEND",
  WEEKEND_AFTER: "ADDITIONAL_HOUR_WEEKEND_OOB",
};

/**
 * Priority-keyed pricing (TCS): the rate sheet is keyed on the visit's SLA used
 * as the priority tier (P1..MACd); the technician band is irrelevant. The
 * first-hour charge covers `freeHoursIncluded` hours; hours beyond that bill at
 * the scenario additional rate. Weekend scenarios multiply the first-hour charge.
 */
function calcPriority(
  visit: DispatchVisitInput,
  rates: DispatchRateRow[],
  profile: DispatchPricingProfile,
): DispatchRow {
  const rounded = roundHours(new Decimal(visit.hoursOnSite.toString()), profile);
  const priority = visit.slaCode;
  const isWeekend = visit.weekend || visit.isPublicHoliday;
  const scenario: Scenario | "WEEKEND_AFTER" = isWeekend
    ? visit.afterHours
      ? "WEEKEND_AFTER"
      : "WEEKEND"
    : visit.afterHours
      ? "OOB"
      : "BUSINESS";

  const firstHour = pickPriority(rates, priority, "FIRST_HOUR");
  const additional = pickPriority(rates, priority, PRIORITY_ADDITIONAL_CODE[scenario]);
  const modifiers: string[] = [];

  let fhMult = new Decimal(1);
  if (scenario === "WEEKEND_AFTER" && profile.weekendAfterFirstHourMultiplier != null) {
    fhMult = new Decimal(profile.weekendAfterFirstHourMultiplier);
    modifiers.push(`weekend-after x${fhMult.toString()}`);
  } else if (scenario === "WEEKEND" && profile.weekendFirstHourMultiplier != null) {
    fhMult = new Decimal(profile.weekendFirstHourMultiplier);
    modifiers.push(`weekend x${fhMult.toString()}`);
  } else if (scenario === "OOB") {
    modifiers.push("after-hours");
  }

  const free = new Decimal(profile.freeHoursIncluded);
  const extraHours = rounded.greaterThan(free) ? rounded.minus(free) : ZERO;
  let base = firstHour.times(fhMult).plus(additional.times(extraHours));

  if (profile.fullDayCap) {
    const fullDay = pickPriority(rates, priority, "FULL_DAY");
    if (fullDay.greaterThan(0) && base.greaterThan(fullDay)) {
      base = fullDay;
      modifiers.push("full-day cap");
    }
  }

  return {
    visitId: visit.id,
    visitDate: visit.visitDate,
    ticketNumber: visit.ticketNumber,
    technicianName: visit.technicianName,
    technicianBand: visit.technicianBand,
    location: visit.location,
    slaCode: visit.slaCode,
    hoursOnSite: Number(rounded.toFixed(2)),
    firstHourRate: Number(firstHour.toFixed(2)),
    additionalHourRate: Number(additional.toFixed(2)),
    charge: Number(base.toFixed(2)),
    modifiersApplied: modifiers,
    notes: visit.notes,
  };
}

/**
 * Band + SLA pricing (the original / STANDARD model). With the STANDARD profile
 * (freeHoursIncluded 1, fullDayCap on, no rounding) this reproduces the original
 * behavior exactly; the profile only parameterizes the free-hours, the cap, and
 * the hours rounding so the same code can serve future band-keyed variants.
 */
function calcBandSla(
  visit: DispatchVisitInput,
  rates: DispatchRateRow[],
  profile: DispatchPricingProfile,
): DispatchRow {
  const rounded = roundHours(new Decimal(visit.hoursOnSite.toString()), profile);
  const band = visit.technicianBand;
  const sla = visit.slaCode;
  const scenario: Scenario =
    visit.weekend || visit.isPublicHoliday ? "WEEKEND" : visit.afterHours ? "OOB" : "BUSINESS";
  const codes = SCENARIO_CODES[scenario];
  const modifiers: string[] = [];

  const row = (firstHourRate: number, additionalHourRate: number, charge: number): DispatchRow => ({
    visitId: visit.id,
    visitDate: visit.visitDate,
    ticketNumber: visit.ticketNumber,
    technicianName: visit.technicianName,
    technicianBand: visit.technicianBand,
    location: visit.location,
    slaCode: visit.slaCode,
    hoursOnSite: Number(rounded.toFixed(2)),
    firstHourRate,
    additionalHourRate,
    charge,
    modifiersApplied: modifiers,
    notes: visit.notes,
  });

  // 1) Flat per-ticket: scenario-specific (PER_TICKET_BUSINESS / _OOB) first, then
  // a generic legacy PER_TICKET. Either bills once per visit, bypassing the rest.
  const scenarioFlat = codes.perTicket ? pick(rates, band, sla, codes.perTicket) : ZERO;
  const legacyFlat = pick(rates, band, sla, "PER_TICKET");
  const flat = !scenarioFlat.isZero() ? scenarioFlat : legacyFlat;
  if (!flat.isZero()) {
    modifiers.push("per-ticket");
    return row(Number(flat.toFixed(2)), 0, Number(flat.toFixed(2)));
  }

  const free = new Decimal(profile.freeHoursIncluded);
  const extraHours = rounded.greaterThan(free) ? rounded.minus(free) : ZERO;
  const fullDay = pick(rates, band, sla, "FULL_DAY");
  const capBase = (base: DecimalLike): DecimalLike => {
    if (profile.fullDayCap && fullDay.greaterThan(0) && base.greaterThan(fullDay)) {
      modifiers.push("full-day cap");
      return fullDay;
    }
    return base;
  };

  // 2) Explicit scenario hourly rates, when present, price the scenario directly
  // (no multiplier on top).
  const scnFirst = pick(rates, band, sla, codes.first);
  const scnAddl = pick(rates, band, sla, codes.additional);
  if (!scnFirst.isZero() || !scnAddl.isZero()) {
    const base = capBase(scnFirst.plus(scnAddl.times(extraHours)));
    if (scenario === "OOB") modifiers.push("out-of-business");
    else if (scenario === "WEEKEND") modifiers.push(visit.isPublicHoliday ? "public-holiday" : "weekend");
    return row(Number(scnFirst.toFixed(2)), Number(scnAddl.toFixed(2)), Number(base.toFixed(2)));
  }

  // 3) Legacy fallback: business first/additional rates with a scenario multiplier.
  const firstHourRate = pick(rates, band, sla, "FIRST_HOUR");
  const additionalHourRate = pick(rates, band, sla, "ADDITIONAL_HOUR");
  const base = capBase(firstHourRate.plus(additionalHourRate.times(extraHours)));
  let uplift = new Decimal(1);
  if (scenario === "WEEKEND") {
    const m = pick(rates, band, sla, "WEEKEND_PH_MULTIPLIER");
    uplift = m.greaterThan(0) ? m : DEFAULT_WEEKEND_PH_MULTIPLIER;
    modifiers.push(`${visit.isPublicHoliday ? "public-holiday" : "weekend"} x${uplift.toString()}`);
  } else if (scenario === "OOB") {
    const m = pick(rates, band, sla, "OOBH_MULTIPLIER");
    uplift = m.greaterThan(0) ? m : DEFAULT_OOBH_MULTIPLIER;
    modifiers.push(`after-hours x${uplift.toString()}`);
  }
  const charge = base.times(uplift);
  return row(
    Number(firstHourRate.toFixed(2)),
    Number(additionalHourRate.toFixed(2)),
    Number(charge.toFixed(2)),
  );
}
