// Dispatch / Schedule Visit pre-invoice math.
//
// Per-visit billing. No backfill semantics — Dispatch does not import
// coverage logic.
//
// Visit charge = firstHourRate + max(0, hoursOnSite - 1) × additionalHourRate
//   when afterHours: rates may be uplifted to the OUT_OF_OFFICE variant
//   when weekend: rates may be uplifted to the WEEKEND variant
//
// Rate lookup keys on (band, slaId of the visit). Sub-cat codes:
//   FIRST_HOUR / ADDITIONAL_HOUR / OUT_OF_OFFICE / WEEKEND.

import { Prisma } from "@prisma/client";

const Decimal = Prisma.Decimal;
type DecimalLike = InstanceType<typeof Decimal>;

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

  const baseFirst = pick(rates, visit.technicianBand, visit.slaCode, "FIRST_HOUR");
  const baseAdditional = pick(
    rates,
    visit.technicianBand,
    visit.slaCode,
    "ADDITIONAL_HOUR",
  );

  let firstHourRate = baseFirst;
  let additionalHourRate = baseAdditional;
  const modifiers: string[] = [];

  if (visit.afterHours) {
    const outOfOffice = pick(
      rates,
      visit.technicianBand,
      visit.slaCode,
      "OUT_OF_OFFICE",
    );
    if (!outOfOffice.isZero()) {
      // OUT_OF_OFFICE is treated as an alternative hourly rate covering all
      // hours of an after-hours visit.
      firstHourRate = outOfOffice;
      additionalHourRate = outOfOffice;
      modifiers.push("after-hours");
    }
  }

  if (visit.weekend) {
    const weekend = pick(rates, visit.technicianBand, visit.slaCode, "WEEKEND");
    if (!weekend.isZero()) {
      firstHourRate = weekend;
      additionalHourRate = weekend;
      modifiers.push("weekend");
    }
  }

  const extraHours = hours.greaterThan(1)
    ? hours.minus(1)
    : new Decimal(0);
  const charge = firstHourRate.plus(additionalHourRate.times(extraHours));

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
