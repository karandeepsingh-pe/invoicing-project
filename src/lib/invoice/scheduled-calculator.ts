// Scheduled-visit pre-invoice math.
//
// Per-day billing from TimesheetEntry rows, like Project but with NO monthly cap
// and a distinct Half Day rate (Half Day is its own price, not 0.5 x Full Day).
//
// A worked cell is a full day (status null, hours >= defaultHours) or a half day
// (status HALF_DAY, or status null with 0 < hours < defaultHours). PH / AB / NA /
// PTO count as zero (a scheduled engagement bills only the visits actually made).
//
// Weekend variant: when the rate sheet carries FULL_DAY_WEEKEND / HALF_DAY_WEEKEND
// and a cell's date is a Saturday/Sunday, that day bills the weekend rate. With no
// weekend rate set, weekend days bill the regular Full/Half Day rate (back-compat).
//
//   extendedTotal = fullDays x FULL_DAY + halfDays x HALF_DAY
//                 + weekendFullDays x FULL_DAY_WEEKEND + weekendHalfDays x HALF_DAY_WEEKEND
//
// Rate lookup keys on (band, SLA). Sub-cat codes:
//   FULL_DAY / HALF_DAY / FULL_DAY_WEEKEND / HALF_DAY_WEEKEND.

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
  // Optional: when present and a Saturday/Sunday, the day bills the weekend rate
  // (only if a weekend rate is set; otherwise it bills the regular rate).
  date?: Date;
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
  weekendFullDays: number;
  weekendHalfDays: number;
  daysWorked: DecimalLike; // all full + 0.5 x all half, for display
  fullDayRate: DecimalLike;
  halfDayRate: DecimalLike;
  fullDayWeekendRate: DecimalLike;
  halfDayWeekendRate: DecimalLike;
  extendedTotal: DecimalLike;
};

const ZERO = new Decimal(0);

function isWeekendUtc(d?: Date): boolean {
  if (!d) return false;
  const day = d.getUTCDay();
  return day === 0 || day === 6;
}

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
  const fullDayWeekendRate = pick(input.rates, input.band, "FULL_DAY_WEEKEND", input.slaCode);
  const halfDayWeekendRate = pick(input.rates, input.band, "HALF_DAY_WEEKEND", input.slaCode);
  // Only route weekend-dated days to the weekend bucket when a weekend rate exists;
  // otherwise they bill as regular days (back-compat).
  const hasWeekendRates = fullDayWeekendRate.greaterThan(0) || halfDayWeekendRate.greaterThan(0);

  let fullDays = 0;
  let halfDays = 0;
  let weekendFullDays = 0;
  let weekendHalfDays = 0;
  for (const cell of input.entries) {
    let kind: "full" | "half" | null = null;
    if (cell.status === "HALF_DAY") {
      kind = "half";
    } else if (cell.status === null) {
      const h = new Decimal(cell.hours.toString());
      if (h.greaterThanOrEqualTo(input.defaultHours)) kind = "full";
      else if (h.greaterThan(0)) kind = "half"; // a partial worked day bills the half-day rate
    }
    if (kind === null) continue; // PH / AB / NA / PTO -> not a billed visit
    const weekend = hasWeekendRates && isWeekendUtc(cell.date);
    if (kind === "full") {
      if (weekend) weekendFullDays += 1;
      else fullDays += 1;
    } else {
      if (weekend) weekendHalfDays += 1;
      else halfDays += 1;
    }
  }

  const extendedTotal = fullDayRate
    .times(fullDays)
    .plus(halfDayRate.times(halfDays))
    .plus(fullDayWeekendRate.times(weekendFullDays))
    .plus(halfDayWeekendRate.times(weekendHalfDays));
  const daysWorked = new Decimal(fullDays + weekendFullDays).plus(
    new Decimal(halfDays + weekendHalfDays).times("0.5"),
  );

  return {
    fullDays,
    halfDays,
    weekendFullDays,
    weekendHalfDays,
    daysWorked,
    fullDayRate,
    halfDayRate,
    fullDayWeekendRate,
    halfDayWeekendRate,
    extendedTotal,
  };
}
