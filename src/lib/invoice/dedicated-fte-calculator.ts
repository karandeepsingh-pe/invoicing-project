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

  /** Days delta from coverage events (negative for covered tech, positive for covering). */
  coverageDaysDelta?: DecimalLike;
  /** OT hours delta from coverage events (positive for covering tech). */
  coverageOtDelta?: DecimalLike;
  /** Weekend hours delta from coverage events (positive for covering tech). */
  coverageWeekendDelta?: DecimalLike;

  /** Override day rate (covering line billed at covered tech's monthlyRate). */
  overrideDayRate?: DecimalLike;
  /** Override OT rate (covering line). */
  overrideOtRate?: DecimalLike;
  /** Override weekend rate (covering line). */
  overrideWeekendRate?: DecimalLike;
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
  const coverageOt = input.coverageOtDelta ?? ZERO;
  const coverageWe = input.coverageWeekendDelta ?? ZERO;

  const otHours = split.otHours.plus(coverageOt);
  const weekendHours = split.weekendHours.plus(coverageWe);

  // The billed "regular" quantity: days (regularDays + coverage days). The day
  // rate is the annual-derived per-day rate resolved by fte-rows.
  const daysWorked = split.regularDays.plus(coverageDays);

  const effectiveDayRate = input.overrideDayRate ?? dayRate;
  const effectiveOtRate = input.overrideOtRate ?? otRate;
  const effectiveWeekendRate = input.overrideWeekendRate ?? weekendRate;

  // Per-day rate × days (businessDays is informational; it does not scale the
  // portion). OT + weekend are per-hour.
  const daysWorkedPortion = effectiveDayRate.times(daysWorked);
  const otPortion = effectiveOtRate.times(otHours);
  const weekendPortion = effectiveWeekendRate.times(weekendHours);

  const extendedTotal = daysWorkedPortion.plus(otPortion).plus(weekendPortion);

  return {
    daysWorked,
    otHours,
    weekendHours,
    dayRate: effectiveDayRate,
    otRate: effectiveOtRate,
    weekendRate: effectiveWeekendRate,
    daysWorkedPortion,
    otPortion,
    weekendPortion,
    extendedTotal,
  };
}
