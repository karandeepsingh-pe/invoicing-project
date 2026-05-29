// Project / T&M pre-invoice math.
//
// Per-day billing from TimesheetEntry rows. No backfill semantics — Project
// does not import coverage logic.
//
// daysWorked   = computeDaysWorked(entries) using same convention as FTE
//                (full day for hours >= defaultHours; fractional below).
// dayRate      = AccountRate where subCat = FULL_DAY and band matches
// extendedTotal = daysWorked × dayRate
//
// HALF_DAY rate is reserved for future fractional-day pricing variants; for
// v1 a fractional dayCount simply multiplies the FULL_DAY rate.

import { Prisma, type TimesheetDayStatus } from "@prisma/client";
import { computeDaysWorked } from "./dedicated-fte-calculator";

const Decimal = Prisma.Decimal;
type DecimalLike = InstanceType<typeof Decimal>;

export type ProjectRateRow = {
  rateAmount: DecimalLike | null;
  band: number;
  rateSubCategory: { code: string };
  sla: { code: string };
};

export type ProjectTimesheetCell = {
  hours: DecimalLike;
  status: TimesheetDayStatus | null;
};

export type ProjectCalcInput = {
  defaultHours: number;
  band: number;
  slaCode?: string;
  entries: ProjectTimesheetCell[];
  rates: ProjectRateRow[];
};

export type ProjectCalcOutput = {
  daysWorked: DecimalLike;
  dayRate: DecimalLike;
  extendedTotal: DecimalLike;
};

const ZERO = new Decimal(0);

function pick(
  rates: ProjectRateRow[],
  band: number,
  subCatCode: string,
  slaCode?: string,
): DecimalLike {
  const row = rates.find(
    (r) =>
      r.band === band &&
      r.rateSubCategory.code === subCatCode &&
      (slaCode === undefined || r.sla.code === slaCode),
  );
  if (!row || row.rateAmount === null) return ZERO;
  return new Decimal(row.rateAmount.toString());
}

export function calculateProjectRow(input: ProjectCalcInput): ProjectCalcOutput {
  const dayRate = pick(input.rates, input.band, "FULL_DAY", input.slaCode);
  const daysWorked = computeDaysWorked(input.entries, input.defaultHours);
  const extendedTotal = dayRate.times(daysWorked);
  return { daysWorked, dayRate, extendedTotal };
}
