// Scheduled-visit pre-invoice math.
//
// Per-day billing from TimesheetEntry rows, like Project but with NO monthly cap
// and a distinct Half Day rate (Half Day is its own price, not 0.5 x Full Day).
//
// A worked cell is a full day (status null, hours >= defaultHours), an HOURLY
// visit (status null, 0 < hours < defaultHours, when an HOURLY_BUSINESS /
// HOURLY_WEEKEND rate is set — bills hours x rate), or a half day (status
// HALF_DAY; or a sub-default-hours cell when NO hourly rate is set —
// back-compat). PH / AB / NA / PTO count as zero (a scheduled engagement
// bills only the visits actually made).
//
// Weekend variant: when the rate sheet carries FULL_DAY_WEEKEND / HALF_DAY_WEEKEND
// and a cell's date is a Saturday/Sunday, that day bills the weekend rate. With no
// weekend rate set, weekend days bill the regular Full/Half Day rate (back-compat).
// Weekend hourly cells use HOURLY_WEEKEND when set, else HOURLY_BUSINESS.
//
//   extendedTotal = fullDays x FULL_DAY + halfDays x HALF_DAY
//                 + weekendFullDays x FULL_DAY_WEEKEND + weekendHalfDays x HALF_DAY_WEEKEND
//                 + hourlyHours x HOURLY_BUSINESS + weekendHourlyHours x HOURLY_WEEKEND
//
// Rate lookup keys on (band, SLA). Sub-cat codes: FULL_DAY / HALF_DAY /
// FULL_DAY_WEEKEND / HALF_DAY_WEEKEND / HOURLY_BUSINESS / HOURLY_WEEKEND.

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
  hourlyHours: DecimalLike;
  weekendHourlyHours: DecimalLike;
  daysWorked: DecimalLike; // full + 0.5 x half + hourly/defaultHours, for display
  fullDayRate: DecimalLike;
  halfDayRate: DecimalLike;
  fullDayWeekendRate: DecimalLike;
  halfDayWeekendRate: DecimalLike;
  hourlyRate: DecimalLike;
  weekendHourlyRate: DecimalLike;
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
  const hourlyRate = pick(input.rates, input.band, "HOURLY_BUSINESS", input.slaCode);
  const weekendHourlyLookup = pick(input.rates, input.band, "HOURLY_WEEKEND", input.slaCode);
  const weekendHourlyRate = weekendHourlyLookup.greaterThan(0) ? weekendHourlyLookup : hourlyRate;
  // Only route weekend-dated days to the weekend bucket when a weekend rate exists;
  // otherwise they bill as regular days (back-compat).
  const hasWeekendRates = fullDayWeekendRate.greaterThan(0) || halfDayWeekendRate.greaterThan(0);
  // Hourly billing only activates when an hourly rate is set; otherwise a
  // sub-default-hours cell bills the half-day rate (back-compat).
  const hasHourlyRate = hourlyRate.greaterThan(0) || weekendHourlyLookup.greaterThan(0);

  let fullDays = 0;
  let halfDays = 0;
  let weekendFullDays = 0;
  let weekendHalfDays = 0;
  let hourlyHours = ZERO;
  let weekendHourlyHours = ZERO;
  for (const cell of input.entries) {
    let kind: "full" | "half" | "hourly" | null = null;
    let cellHours = ZERO;
    if (cell.status === "HALF_DAY") {
      kind = "half";
    } else if (cell.status === null) {
      const h = new Decimal(cell.hours.toString());
      if (h.greaterThanOrEqualTo(input.defaultHours)) kind = "full";
      else if (h.greaterThan(0)) {
        kind = hasHourlyRate ? "hourly" : "half";
        cellHours = h;
      }
    }
    if (kind === null) continue; // PH / AB / NA / PTO -> not a billed visit
    const weekendDate = isWeekendUtc(cell.date);
    if (kind === "full") {
      if (hasWeekendRates && weekendDate) weekendFullDays += 1;
      else fullDays += 1;
    } else if (kind === "half") {
      if (hasWeekendRates && weekendDate) weekendHalfDays += 1;
      else halfDays += 1;
    } else {
      if (weekendDate && weekendHourlyLookup.greaterThan(0)) {
        weekendHourlyHours = weekendHourlyHours.plus(cellHours);
      } else {
        hourlyHours = hourlyHours.plus(cellHours);
      }
    }
  }

  const extendedTotal = fullDayRate
    .times(fullDays)
    .plus(halfDayRate.times(halfDays))
    .plus(fullDayWeekendRate.times(weekendFullDays))
    .plus(halfDayWeekendRate.times(weekendHalfDays))
    .plus(hourlyRate.times(hourlyHours))
    .plus(weekendHourlyRate.times(weekendHourlyHours));
  const daysWorked = new Decimal(fullDays + weekendFullDays)
    .plus(new Decimal(halfDays + weekendHalfDays).times("0.5"))
    .plus(hourlyHours.plus(weekendHourlyHours).dividedBy(input.defaultHours));

  return {
    fullDays,
    halfDays,
    weekendFullDays,
    weekendHalfDays,
    hourlyHours,
    weekendHourlyHours,
    daysWorked,
    fullDayRate,
    halfDayRate,
    fullDayWeekendRate,
    halfDayWeekendRate,
    hourlyRate,
    weekendHourlyRate,
    extendedTotal,
  };
}
