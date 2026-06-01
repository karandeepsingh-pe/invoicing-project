// Project / T&M pre-invoice math.
//
// Per-day billing from TimesheetEntry rows, capped at a flat monthly rate. No
// backfill semantics — Project does not import coverage logic.
//
// daysWorked    = computeDaysWorked(entries) using same convention as FTE
//                 (full day for hours >= defaultHours; fractional below).
// dayRate       = AccountRate where subCat = FULL_DAY and band matches
// monthlyRate   = AccountRate where subCat = MONTHLY and band matches (0 if unset)
// extendedTotal = min(daysWorked × dayRate, monthlyRate)  when monthlyRate > 0
//                 daysWorked × dayRate                     otherwise
//
// So a fully-worked month bills the flat monthly rate (the cap), while a partial
// month bills per day. HALF_DAY is reserved; a fractional dayCount multiplies the
// FULL_DAY rate. The reference invoice has two monthly columns (<3 vs >3 months);
// both are equal there, so v1 uses a single MONTHLY rate as the cap.

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
  monthlyRate: DecimalLike;
  extendedTotal: DecimalLike;
  capped: boolean;
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
  const monthlyRate = pick(input.rates, input.band, "MONTHLY", input.slaCode);
  const daysWorked = computeDaysWorked(input.entries, input.defaultHours);
  const daysTotal = dayRate.times(daysWorked);

  // Cap the per-day total at the flat monthly rate when one is set: a full month
  // bills the monthly rate, a partial month bills per day.
  const capped = monthlyRate.greaterThan(0) && daysTotal.greaterThanOrEqualTo(monthlyRate);
  const extendedTotal = capped ? monthlyRate : daysTotal;

  return { daysWorked, dayRate, monthlyRate, extendedTotal, capped };
}
