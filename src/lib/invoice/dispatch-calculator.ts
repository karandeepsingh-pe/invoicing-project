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
  // Wall-clock onsite times ("HH:mm"), and the account's business-hours window.
  // When all three are present (and the visit is a weekday), the band_sla path
  // splits the visit's hours across BUSINESS / after-hours (OOB) windows and bills
  // each at its own rate. Absent any of them, billing falls back to the single
  // scenario picked from the afterHours/weekend flags (unchanged legacy behavior).
  inTime?: string | null;
  outTime?: string | null;
  businessWindow?: { start: string; end: string } | null;
  // Manual after-hours fallback: when the visit has no In/Out times, this many of
  // the total hours are billed at the after-hours (OOB) rate and the rest at the
  // business rate (first hour still billed once, at the leading window's rate).
  oooHrs?: number | null;
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

/** Parse "HH:mm" to minutes since midnight, or null when malformed. */
function toMinutes(hhmm: string | null | undefined): number | null {
  if (!hhmm) return null;
  const m = /^(\d{2}):(\d{2})$/.exec(hhmm);
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}

type HourSegment = { scenario: Scenario; hours: DecimalLike };

/**
 * Split a weekday onsite interval [inM, outM) against the business window
 * [startM, endM) into chronological BUSINESS / OOB segments, then scale the
 * segment hours so they sum to `total` (the profile-rounded billable hours, kept
 * authoritative so the split never drifts from the entered total). Returns null
 * when the interval is non-positive (caller falls back to the single-scenario path).
 */
function weekdaySegments(
  inM: number,
  outM: number,
  startM: number,
  endM: number,
  total: DecimalLike,
): HourSegment[] | null {
  // Out ≤ In = the visit crossed midnight (overnight ticket). Wrap the out
  // minute into the next day: every post-midnight minute falls in the
  // trailing OOB segment (the business window only exists on the start day).
  if (outM <= inM) outM += 24 * 60;
  const span = outM - inM;
  const seg = (scenario: Scenario, fromM: number, toM: number): HourSegment | null => {
    const mins = Math.max(0, Math.min(outM, toM) - Math.max(inM, fromM));
    return mins > 0 ? { scenario, hours: new Decimal(mins) } : null;
  };
  const raw = [
    seg("OOB", -Infinity, startM), // before the window opens
    seg("BUSINESS", startM, endM), // within business hours
    seg("OOB", endM, Infinity), // after the window closes (after 5pm)
  ].filter((s): s is HourSegment => s !== null);
  if (raw.length === 0) return null;
  // Scale minute-based hours to the authoritative total billable hours.
  return raw.map((s) => ({
    scenario: s.scenario,
    hours: s.hours.dividedBy(span).times(total),
  }));
}

/**
 * Manual after-hours fallback (no In/Out times): `ooo` of the total hours bill at
 * the after-hours (OOB) rate, the rest at business. Business leads (so the first
 * hour is a business hour unless the whole visit is after-hours).
 */
function manualSegments(total: DecimalLike, ooo: DecimalLike): HourSegment[] | null {
  if (total.lessThanOrEqualTo(0)) return null;
  const oob = ooo.greaterThan(total) ? total : ooo;
  const biz = total.minus(oob);
  const segs: HourSegment[] = [];
  if (biz.greaterThan(0)) segs.push({ scenario: "BUSINESS", hours: biz });
  if (oob.greaterThan(0)) segs.push({ scenario: "OOB", hours: oob });
  return segs.length > 0 ? segs : null;
}

/**
 * Walk the chronological segments: the first-hour charge is billed once at the
 * leading segment's window (FIRST_HOUR / _OOB / _WEEKEND), `freeHoursIncluded`
 * hours are then consumed across segments, and every remaining hour bills at its
 * own window's ADDITIONAL rate. Returns the (uncapped) base + reporting fields.
 */
function chargeFromSegments(
  segments: HourSegment[],
  rates: DispatchRateRow[],
  band: number,
  sla: string,
  free: DecimalLike,
): { firstRate: DecimalLike; startScenario: Scenario; base: DecimalLike; hasBusiness: boolean; hasOob: boolean } {
  const startScenario = segments[0].scenario;
  const firstRate = pick(rates, band, sla, SCENARIO_CODES[startScenario].first);
  let remainingFree = free;
  let additionalBase = ZERO;
  for (const s of segments) {
    const used = Decimal.min(remainingFree, s.hours);
    remainingFree = remainingFree.minus(used);
    const billable = s.hours.minus(used);
    if (billable.greaterThan(0)) {
      const addl = pick(rates, band, sla, SCENARIO_CODES[s.scenario].additional);
      additionalBase = additionalBase.plus(addl.times(billable));
    }
  }
  return {
    firstRate,
    startScenario,
    base: firstRate.plus(additionalBase),
    hasBusiness: segments.some((s) => s.scenario === "BUSINESS"),
    hasOob: segments.some((s) => s.scenario === "OOB"),
  };
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
  // Dispatch rates are stored flat at the profile's rateBand (2), not the
  // technician's own band — look up there so the matrix always drives the charge.
  const band = profile.rateBand;
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

  // 1a) Hour-split paths (WEEKDAY only — a weekend/holiday day bills the whole
  // visit at the WEEKEND scenario in the single-scenario branches below). The first
  // hour is billed once at the leading window's FIRST_HOUR rate; each additional
  // hour bills at its own window's ADDITIONAL rate. Two ways to obtain the segments:
  //   (i) clock split  — In/Out times against the account business-hours window;
  //   (ii) manual OOO   — when there are no In/Out times, `oooHrs` of the total are
  //                       after-hours and the rest business.
  const dayIsWeekend = visit.weekend || visit.isPublicHoliday;
  if (!dayIsWeekend) {
    const startM = toMinutes(visit.businessWindow?.start);
    const endM = toMinutes(visit.businessWindow?.end);
    const inM = toMinutes(visit.inTime);
    const outM = toMinutes(visit.outTime);
    let segments: HourSegment[] | null = null;
    if (startM !== null && endM !== null && inM !== null && outM !== null) {
      segments = weekdaySegments(inM, outM, startM, endM, rounded);
    } else if (visit.oooHrs != null && visit.oooHrs > 0) {
      segments = manualSegments(rounded, new Decimal(visit.oooHrs));
    }
    if (segments && segments.length > 0) {
      const r = chargeFromSegments(segments, rates, band, sla, free);
      const base = capBase(r.base);
      modifiers.push(
        r.hasBusiness && r.hasOob ? "split business/after-hours" : r.hasOob ? "out-of-business" : "business",
      );
      const startAddl = pick(rates, band, sla, SCENARIO_CODES[r.startScenario].additional);
      return row(Number(r.firstRate.toFixed(2)), Number(startAddl.toFixed(2)), Number(base.toFixed(2)));
    }
  }

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
