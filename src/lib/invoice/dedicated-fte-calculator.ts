import { Prisma, type TimesheetDayStatus } from "@prisma/client";
import { splitEntries, type DayCell } from "./hours-split";

const Decimal = Prisma.Decimal;
type DecimalLike = InstanceType<typeof Decimal>;

export type RateRow = {
  rateAmount: DecimalLike | null;
  rateSubCategory: { code: string };
  sla: { code: string };
};

/**
 * Date-bearing timesheet cell. The calculator derives regular / OT / weekend
 * buckets from the date weekday + defaultHours; callers pass entries as-is
 * from the DB, no pre-bucketed totals.
 */
export type TimesheetCell = DayCell;

export type SlaTier = "BACKFILL" | "NO_BACKFILL" | "NONE";

export type CalcInput = {
  defaultHours: number;
  businessDays: number;
  entries: TimesheetCell[];
  rates: RateRow[];
  slaTier: SlaTier;

  /**
   * Days delta from coverage events — negative day-debit on the COVERED tech.
   * (The covering side no longer rides this calculator: backfill lines are
   * synthesized separately in fte-rows at the covered seat's rates.)
   */
  coverageDaysDelta?: DecimalLike;
};

export type CalcOutput = {
  /** Regular days from timesheet + coverage delta (what shows in "Days Worked"). */
  daysWorked: DecimalLike;
  otHours: DecimalLike;
  weekendHours: DecimalLike;

  dayRate: DecimalLike;
  otRate: DecimalLike;
  weekendRate: DecimalLike;

  daysWorkedPortion: DecimalLike;
  otPortion: DecimalLike;
  weekendPortion: DecimalLike;
  extendedTotal: DecimalLike;
};

const ZERO = new Decimal(0);

function pickRate(rates: RateRow[], code: string, slaCode?: string): DecimalLike {
  const row = rates.find(
    (r) =>
      r.rateSubCategory.code === code &&
      (slaCode === undefined || r.sla.code === slaCode),
  );
  if (!row || row.rateAmount === null) return ZERO;
  return new Decimal(row.rateAmount.toString());
}

/**
 * Legacy helper kept for callers that still want a single "days worked"
 * number derived without weekday/weekend awareness. Used by Project/T&M
 * which has no OT or weekend concept. Do not use for new Dedicated FTE math
 * — call `splitEntries` from `hours-split.ts` instead.
 */
export function computeDaysWorked(
  entries: { hours: DecimalLike; status: TimesheetDayStatus | null }[],
  defaultHours: number,
): DecimalLike {
  if (defaultHours <= 0) {
    throw new Error("computeDaysWorked: defaultHours must be > 0");
  }
  let fullDays = new Decimal(0);
  let partialHours = new Decimal(0);
  for (const cell of entries) {
    if (cell.status !== null) continue;
    const h = new Decimal(cell.hours.toString());
    if (h.greaterThanOrEqualTo(defaultHours)) {
      fullDays = fullDays.plus(1);
    } else if (h.greaterThan(0)) {
      partialHours = partialHours.plus(h);
    }
  }
  return fullDays.plus(partialHours.dividedBy(defaultHours));
}

/**
 * Core Dedicated FTE pre-invoice math for one technician.
 *
 * Reads each cell's date to bucket hours into regular / OT / weekend using
 * `splitEntries`. Adds optional coverage deltas (for the covered + covering
 * tech sides of a backfill event). Rates resolved per slaTier; overrides
 * applied for the covering line.
 *
 * Legacy fallback: if MONTHLY_DAY_RATE row is missing, falls back to old
 * ANNUAL_BACKFILL code so pre-migration data still resolves a number.
 */
export function calculateDedicatedFteRow(input: CalcInput): CalcOutput {
  const tierSlaCode = input.slaTier === "NONE" ? undefined : input.slaTier;

  const dayRateLookup = pickRate(input.rates, "MONTHLY_DAY_RATE", tierSlaCode);
  const dayRate = dayRateLookup.isZero()
    ? pickRate(input.rates, "ANNUAL_BACKFILL", tierSlaCode)
    : dayRateLookup;
  const otRateLookup = pickRate(input.rates, "OT_HOURLY_RATE", tierSlaCode);
  const otRate = otRateLookup.isZero()
    ? pickRate(input.rates, "HOURLY_BACKFILL_OT", tierSlaCode)
    : otRateLookup;
  const weekendRateLookup = pickRate(
    input.rates,
    "WEEKEND_HOURLY_RATE",
    tierSlaCode,
  );
  const weekendRate = weekendRateLookup.isZero()
    ? pickRate(input.rates, "HOURLY_BACKFILL_WEEKEND", tierSlaCode)
    : weekendRateLookup;

  const split = splitEntries(input.entries, input.defaultHours);

  const coverageDays = input.coverageDaysDelta ?? ZERO;

  const otHours = split.otHours;
  const weekendHours = split.weekendHours;

  // The billed "regular" quantity: days (regularDays + the covered-side
  // coverage debit). The day rate is the annual-derived per-day rate resolved
  // by fte-rows.
  const daysWorked = split.regularDays.plus(coverageDays);

  // Per-day rate × days (businessDays is informational; it does not scale the
  // portion). OT + weekend are per-hour.
  const daysWorkedPortion = dayRate.times(daysWorked);
  const otPortion = otRate.times(otHours);
  const weekendPortion = weekendRate.times(weekendHours);

  const extendedTotal = daysWorkedPortion.plus(otPortion).plus(weekendPortion);

  return {
    daysWorked,
    otHours,
    weekendHours,
    dayRate,
    otRate,
    weekendRate,
    daysWorkedPortion,
    otPortion,
    weekendPortion,
    extendedTotal,
  };
}
