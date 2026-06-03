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
// fractional below). No backfill semantics. OT / weekend / OOO are a later pass.

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
  extendedTotal: DecimalLike;
  basis: ProjectBasis;
  // true only when a Day-basis line hits the monthly cap.
  capped: boolean;
  // Whether the line is a flat amount (weekly/monthly/day-capped) rather than a
  // per-day rate × days line. Drives how the invoice renders the row.
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

export function calculateProjectRow(input: ProjectCalcInput): ProjectCalcOutput {
  const dayRate = pick(input.rates, input.band, "FULL_DAY", input.slaCode);
  const weeklyRate = pick(input.rates, input.band, "WEEKLY", input.slaCode);
  const monthlyRate = pick(input.rates, input.band, "MONTHLY", input.slaCode);
  const daysWorked = computeDaysWorked(input.entries, input.defaultHours);
  const base = { daysWorked, dayRate, weeklyRate, monthlyRate };

  // 1. Weekly basis.
  if (weeklyRate.greaterThan(0)) {
    const weeks = daysWorked.dividedBy(5);
    return {
      ...base,
      extendedTotal: weeklyRate.times(weeks),
      basis: "weekly",
      capped: false,
      flat: true,
      remark: `Weekly ${weeks.toFixed(2)} wk`,
    };
  }

  // 2. Day basis (optionally capped at the monthly rate).
  if (dayRate.greaterThan(0)) {
    const daysTotal = dayRate.times(daysWorked);
    const capped =
      monthlyRate.greaterThan(0) && daysTotal.greaterThanOrEqualTo(monthlyRate);
    return {
      ...base,
      extendedTotal: capped ? monthlyRate : daysTotal,
      basis: "day",
      capped,
      flat: capped,
      remark: capped ? "Monthly cap" : undefined,
    };
  }

  // 3. Monthly basis (pure monthly, pro-rated by days / businessDays).
  if (monthlyRate.greaterThan(0)) {
    const bd =
      input.businessDays && input.businessDays > 0
        ? new Decimal(input.businessDays)
        : daysWorked; // fallback: bills the full monthly when businessDays is unknown
    const extendedTotal = bd.greaterThan(0)
      ? monthlyRate.times(daysWorked).dividedBy(bd)
      : ZERO;
    return {
      ...base,
      extendedTotal,
      basis: "monthly",
      capped: false,
      flat: true,
      remark: `Monthly pro-rated ${daysWorked.toFixed(0)}/${input.businessDays ?? daysWorked.toFixed(0)}`,
    };
  }

  // 4. Unpriced.
  return {
    ...base,
    extendedTotal: ZERO,
    basis: "unpriced",
    capped: false,
    flat: false,
  };
}
