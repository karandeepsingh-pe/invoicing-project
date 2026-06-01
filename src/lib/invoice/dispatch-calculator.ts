// Dispatch / Schedule Visit pre-invoice math.
//
// Per-visit billing. No backfill semantics — Dispatch does not import
// coverage logic.
//
// base   = firstHourRate + max(0, hoursOnSite - 1) × additionalHourRate
//          (FIRST_HOUR = SLA first-hour rate; ADDITIONAL_HOUR = T&M hourly)
// base   = min(base, FULL_DAY)                          when a full-day cap is set
// charge = round2(base × uplift), where uplift is:
//            WEEKEND_PH_MULTIPLIER (default 2.0)  when weekend or public holiday
//            OOBH_MULTIPLIER       (default 1.5)  when after-hours (and not weekend/PH)
//            1.0                                  otherwise
//   Weekend/PH takes precedence over OOBH; the two do not stack.
//
// A PER_TICKET rate, when present, is a flat per-visit charge that bypasses the
// hourly model, the cap, and the multipliers.
//
// Rate lookup keys on (band, slaId of the visit). Sub-cat codes:
//   FIRST_HOUR / ADDITIONAL_HOUR / FULL_DAY / OOBH_MULTIPLIER /
//   WEEKEND_PH_MULTIPLIER / PER_TICKET.

import { Prisma } from "@prisma/client";

const Decimal = Prisma.Decimal;
type DecimalLike = InstanceType<typeof Decimal>;

// SOW-standard uplifts, used when the rate sheet does not override them.
const DEFAULT_OOBH_MULTIPLIER = new Decimal("1.5");
const DEFAULT_WEEKEND_PH_MULTIPLIER = new Decimal("2.0");

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

export function calculateDispatchVisit(
  visit: DispatchVisitInput,
  rates: DispatchRateRow[],
): DispatchRow {
  const hours = new Decimal(visit.hoursOnSite.toString());

  // Flat per-ticket pricing (data-driven): when a PER_TICKET rate exists for
  // this band + SLA, bill it once per visit regardless of hours, bypassing the
  // first-hour + additional-hour model.
  const perTicket = pick(rates, visit.technicianBand, visit.slaCode, "PER_TICKET");
  if (!perTicket.isZero()) {
    return {
      visitId: visit.id,
      visitDate: visit.visitDate,
      ticketNumber: visit.ticketNumber,
      technicianName: visit.technicianName,
      technicianBand: visit.technicianBand,
      location: visit.location,
      slaCode: visit.slaCode,
      hoursOnSite: Number(hours.toFixed(2)),
      firstHourRate: Number(perTicket.toFixed(2)),
      additionalHourRate: 0,
      charge: Number(perTicket.toFixed(2)),
      modifiersApplied: ["per-ticket"],
      notes: visit.notes,
    };
  }

  const firstHourRate = pick(rates, visit.technicianBand, visit.slaCode, "FIRST_HOUR");
  const additionalHourRate = pick(
    rates,
    visit.technicianBand,
    visit.slaCode,
    "ADDITIONAL_HOUR",
  );
  const modifiers: string[] = [];

  // Base labor: first hour at the SLA rate + each additional hour at the T&M rate.
  const extraHours = hours.greaterThan(1) ? hours.minus(1) : new Decimal(0);
  let base = firstHourRate.plus(additionalHourRate.times(extraHours));

  // Full-day cap: the per-visit labor never exceeds the full-day rate.
  const fullDay = pick(rates, visit.technicianBand, visit.slaCode, "FULL_DAY");
  if (fullDay.greaterThan(0) && base.greaterThan(fullDay)) {
    base = fullDay;
    modifiers.push("full-day cap");
  }

  // Uplift multiplier on the capped base. Weekend / public-holiday (default 2.0x)
  // takes precedence over after-hours (default 1.5x); the two do not stack.
  let uplift = new Decimal(1);
  if (visit.weekend || visit.isPublicHoliday) {
    const m = pick(rates, visit.technicianBand, visit.slaCode, "WEEKEND_PH_MULTIPLIER");
    uplift = m.greaterThan(0) ? m : DEFAULT_WEEKEND_PH_MULTIPLIER;
    modifiers.push(`${visit.isPublicHoliday ? "public-holiday" : "weekend"} x${uplift.toString()}`);
  } else if (visit.afterHours) {
    const m = pick(rates, visit.technicianBand, visit.slaCode, "OOBH_MULTIPLIER");
    uplift = m.greaterThan(0) ? m : DEFAULT_OOBH_MULTIPLIER;
    modifiers.push(`after-hours x${uplift.toString()}`);
  }

  const charge = base.times(uplift);

  return {
    visitId: visit.id,
    visitDate: visit.visitDate,
    ticketNumber: visit.ticketNumber,
    technicianName: visit.technicianName,
    technicianBand: visit.technicianBand,
    location: visit.location,
    slaCode: visit.slaCode,
    hoursOnSite: Number(hours.toFixed(2)),
    firstHourRate: Number(firstHourRate.toFixed(2)),
    additionalHourRate: Number(additionalHourRate.toFixed(2)),
    charge: Number(charge.toFixed(2)),
    modifiersApplied: modifiers,
    notes: visit.notes,
  };
}
