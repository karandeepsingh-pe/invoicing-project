// Scheduled-visit pre-invoice math.
//
// Per-day billing from TimesheetEntry rows, like Project but with NO monthly cap
// and a distinct Half Day rate (Half Day is its own price, not 0.5 x Full Day).
//
// A worked cell is a full day (status null, hours >= defaultHours) or a half day
// (status HALF_DAY, or status null with 0 < hours < defaultHours). PH / AB / NA /
// PTO count as zero (a scheduled engagement bills only the visits actually made).
//
//   extendedTotal = fullDays x FULL_DAY + halfDays x HALF_DAY
//
// Rate lookup keys on (band, SLA). Sub-cat codes: FULL_DAY / HALF_DAY.

import { Prisma, type TimesheetDayStatus } from "@prisma/client";

const Decimal = Prisma.Decimal;
type DecimalLike = InstanceType<typeof Decimal>;

export type ScheduledRateRow = {
  rateAmount: DecimalLike | null;
  band: number;
  rateSubCategory: { code: string };
  sla: { code: string };
};

export type ScheduledTimesheetCell = {
  hours: DecimalLike;
  status: TimesheetDayStatus | null;
};

export type ScheduledCalcInput = {
  defaultHours: number;
  band: number;
  slaCode?: string;
  entries: ScheduledTimesheetCell[];
  rates: ScheduledRateRow[];
};

export type ScheduledCalcOutput = {
  fullDays: number;
  halfDays: number;
  daysWorked: DecimalLike; // fullDays + 0.5 x halfDays, for display
  fullDayRate: DecimalLike;
  halfDayRate: DecimalLike;
  extendedTotal: DecimalLike;
};

const ZERO = new Decimal(0);

function pick(
  rates: ScheduledRateRow[],
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

export function calculateScheduledRow(input: ScheduledCalcInput): ScheduledCalcOutput {
  if (input.defaultHours <= 0) {
    throw new Error("calculateScheduledRow: defaultHours must be > 0");
  }
  const fullDayRate = pick(input.rates, input.band, "FULL_DAY", input.slaCode);
  const halfDayRate = pick(input.rates, input.band, "HALF_DAY", input.slaCode);

  let fullDays = 0;
  let halfDays = 0;
  for (const cell of input.entries) {
    if (cell.status === "HALF_DAY") {
      halfDays += 1;
      continue;
    }
    if (cell.status !== null) continue; // PH / AB / NA / PTO -> not a billed visit
    const h = new Decimal(cell.hours.toString());
    if (h.greaterThanOrEqualTo(input.defaultHours)) {
      fullDays += 1;
    } else if (h.greaterThan(0)) {
      halfDays += 1; // a partial worked day bills the half-day rate
    }
  }

  const extendedTotal = fullDayRate
    .times(fullDays)
    .plus(halfDayRate.times(halfDays));
  const daysWorked = new Decimal(fullDays).plus(new Decimal(halfDays).times("0.5"));

  return { fullDays, halfDays, daysWorked, fullDayRate, halfDayRate, extendedTotal };
}
