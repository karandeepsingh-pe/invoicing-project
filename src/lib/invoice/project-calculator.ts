// Project / T&M pre-invoice math.
//
// The billing UNIT is the rate basis the technician is priced under on the
// account rate sheet (the rate sheet is the source of truth). Given the
// PROJECT_TM rate rows for the tech's band + SLA, the basis is chosen
// deterministically:
//
//   1. Weekly  (a WEEKLY rate exists): extended = weekly × daysWorked / 5
//      (5 working days = 1 week, pro-rated).
//   2. Day     (a FULL_DAY rate exists): total = daysWorked × dayRate, capped at
//      MONTHLY when a monthly rate is also set. Preserves the JLL model exactly
//      (Full Day 410 + Monthly 8,800 cap).
//   3. Monthly (only a MONTHLY rate, no day rate): extended = monthly ×
//      daysWorked / businessDays (pro-rated, same shape as the FTE day rate). A
//      clean full month bills exactly the monthly rate. Fixes the pure-monthly
//      $0 bug (a monthly-only tech used to bill 0 because there was no day rate).
//   4. Unpriced (no day/weekly/monthly rate): 0, surfaced for review.
//
// daysWorked uses the same convention as FTE (full day for hours >= defaultHours;
// fractional below). No backfill semantics.
//
// Weekend: when the rate sheet carries FULL_DAY_WEEKEND / HALF_DAY_WEEKEND and a
// cell's date is a Saturday/Sunday, that day is priced at the weekend rate and
// ADDED on top of the weekday basis total (weekday days still drive the
// weekly/day/monthly basis). With no weekend rate, weekend days fold into the
// basis as regular days (back-compat).

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
  // Optional: a Saturday/Sunday date routes the day to the weekend rate when one
  // is set (otherwise it folds into the weekday basis).
  date?: Date;
};

export type ProjectCalcInput = {
  defaultHours: number;
  band: number;
  slaCode?: string;
  entries: ProjectTimesheetCell[];
  rates: ProjectRateRow[];
  // Working days in the billing month, used to pro-rate a pure-monthly basis.
  // Omitted in day/weekly cases (unused there).
  businessDays?: number;
};

export type ProjectBasis = "weekly" | "day" | "monthly" | "unpriced";

export type ProjectCalcOutput = {
  daysWorked: DecimalLike;
  dayRate: DecimalLike;
  weeklyRate: DecimalLike;
  monthlyRate: DecimalLike;
  // Weekend-day surcharge added on top of the weekday basis (0 when no weekend rate).
  weekendDaysWorked: DecimalLike;
  weekendTotal: DecimalLike;
  extendedTotal: DecimalLike;
  basis: ProjectBasis;
  // true only when a Day-basis line hits the monthly cap.
  capped: boolean;
  // Whether the line is a flat amount (weekly/monthly/day-capped/has-weekend)
  // rather than a per-day rate × days line. Drives how the invoice renders the row.
  flat: boolean;
  remark?: string;
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

function isWeekendUtc(d?: Date): boolean {
  if (!d) return false;
  const day = d.getUTCDay();
  return day === 0 || day === 6;
}

export function calculateProjectRow(input: ProjectCalcInput): ProjectCalcOutput {
  const dayRate = pick(input.rates, input.band, "FULL_DAY", input.slaCode);
  const weeklyRate = pick(input.rates, input.band, "WEEKLY", input.slaCode);
  const monthlyRate = pick(input.rates, input.band, "MONTHLY", input.slaCode);
  const fullDayWeekendRate = pick(input.rates, input.band, "FULL_DAY_WEEKEND", input.slaCode);
  const halfDayWeekendRate = pick(input.rates, input.band, "HALF_DAY_WEEKEND", input.slaCode);
  const hasWeekendRates = fullDayWeekendRate.greaterThan(0) || halfDayWeekendRate.greaterThan(0);

  // Split weekend-dated days out of the basis when a weekend rate exists; the
  // remaining (weekday) cells drive the weekly/day/monthly basis as before.
  let basisEntries = input.entries;
  let weekendFullDays = 0;
  let weekendHalfDays = 0;
  if (hasWeekendRates) {
    basisEntries = [];
    for (const cell of input.entries) {
      if (!isWeekendUtc(cell.date)) {
        basisEntries.push(cell);
        continue;
      }
      if (cell.status === "HALF_DAY") {
        weekendHalfDays += 1;
      } else if (cell.status === null) {
        const h = new Decimal(cell.hours.toString());
        if (h.greaterThanOrEqualTo(input.defaultHours)) weekendFullDays += 1;
        else if (h.greaterThan(0)) weekendHalfDays += 1;
      }
      // PH / AB / NA / PTO on a weekend -> not billed.
    }
  }
  const weekendTotal = fullDayWeekendRate
    .times(weekendFullDays)
    .plus(halfDayWeekendRate.times(weekendHalfDays));
  const weekendDaysWorked = new Decimal(weekendFullDays).plus(
    new Decimal(weekendHalfDays).times("0.5"),
  );

  const weekdayDaysWorked = computeDaysWorked(basisEntries, input.defaultHours);
  const daysWorked = weekdayDaysWorked.plus(weekendDaysWorked);
  const hasWeekend = weekendTotal.greaterThan(0);
  const weekendRemark = hasWeekend ? `+ ${weekendDaysWorked.toFixed(1)} weekend day(s)` : undefined;
  const withWeekend = (remark?: string): string | undefined =>
    [remark, weekendRemark].filter(Boolean).join(" · ") || undefined;
  const base = { daysWorked, dayRate, weeklyRate, monthlyRate, weekendDaysWorked, weekendTotal };

  // 1. Weekly basis.
  if (weeklyRate.greaterThan(0)) {
    const weeks = weekdayDaysWorked.dividedBy(5);
    return {
      ...base,
      extendedTotal: weeklyRate.times(weeks).plus(weekendTotal),
      basis: "weekly",
      capped: false,
      flat: true,
      remark: withWeekend(`Weekly ${weeks.toFixed(2)} wk`),
    };
  }

  // 2. Day basis (optionally capped at the monthly rate). The cap applies to the
  // weekday day-rate portion; weekend days are added on top of the cap.
  if (dayRate.greaterThan(0)) {
    const daysTotal = dayRate.times(weekdayDaysWorked);
    const capped =
      monthlyRate.greaterThan(0) && daysTotal.greaterThanOrEqualTo(monthlyRate);
    return {
      ...base,
      extendedTotal: (capped ? monthlyRate : daysTotal).plus(weekendTotal),
      basis: "day",
      capped,
      flat: capped || hasWeekend,
      remark: withWeekend(capped ? "Monthly cap" : undefined),
    };
  }

  // 3. Monthly basis (pure monthly, pro-rated by weekday days / businessDays).
  if (monthlyRate.greaterThan(0)) {
    const bd =
      input.businessDays && input.businessDays > 0
        ? new Decimal(input.businessDays)
        : weekdayDaysWorked; // fallback: bills the full monthly when businessDays is unknown
    const monthlyPortion = bd.greaterThan(0)
      ? monthlyRate.times(weekdayDaysWorked).dividedBy(bd)
      : ZERO;
    return {
      ...base,
      extendedTotal: monthlyPortion.plus(weekendTotal),
      basis: "monthly",
      capped: false,
      flat: true,
      remark: withWeekend(
        `Monthly pro-rated ${weekdayDaysWorked.toFixed(0)}/${input.businessDays ?? weekdayDaysWorked.toFixed(0)}`,
      ),
    };
  }

  // 4. No weekday basis rate. If there are weekend-rate days, bill those; else 0.
  if (hasWeekend) {
    return {
      ...base,
      extendedTotal: weekendTotal,
      basis: "day",
      capped: false,
      flat: true,
      remark: weekendRemark,
    };
  }
  return {
    ...base,
    extendedTotal: ZERO,
    basis: "unpriced",
    capped: false,
    flat: false,
  };
}
