// Single source of truth for the Dedicated FTE day-cell hour split.
//
// Each cell's hours are bucketed by date (weekday vs Sat/Sun) and a
// per-account defaultHours threshold:
//   weekday  -> regular = min(hours, defaultHours)
//               OT      = max(0, hours - defaultHours)
//   weekend  -> weekend = hours (no day credit, no OT)
//   PH/AB/NA/PTO -> 0 across all buckets (status overrides numeric value)
//   HALF_DAY -> 0.5 regular days, no OT, no weekend
//
// `regularDays` accumulates `regular / defaultHours` per cell, so a 6-hour
// weekday adds 0.75 days and a 10-hour weekday adds 1 day + 2 OT.

import { Prisma, type TimesheetDayStatus } from "@prisma/client";

const Decimal = Prisma.Decimal;
type DecimalLike = InstanceType<typeof Decimal>;

export type DayCell = {
  date: Date;
  hours: DecimalLike;
  status: TimesheetDayStatus | null;
};

export type SplitTotals = {
  regularDays: DecimalLike;
  otHours: DecimalLike;
  weekendHours: DecimalLike;
};

export type PerCellSplit = {
  date: Date;
  regularHours: DecimalLike;
  regularDays: DecimalLike;
  otHours: DecimalLike;
  weekendHours: DecimalLike;
  status: TimesheetDayStatus | null;
};

export function isWeekendUtc(date: Date): boolean {
  const dow = date.getUTCDay();
  return dow === 0 || dow === 6;
}

const ZERO = new Decimal(0);

export function splitCell(cell: DayCell, defaultHours: number): PerCellSplit {
  if (defaultHours <= 0) {
    throw new Error("splitCell: defaultHours must be > 0");
  }
  if (cell.status !== null) {
    // PH (public holiday) bills as a full PAID day; HALF_DAY counts as half a
    // worked day; AB / NA / PTO count as zero.
    const isPh = cell.status === "PH";
    const isHalf = cell.status === "HALF_DAY";
    const regularDays = isPh ? new Decimal(1) : isHalf ? new Decimal("0.5") : ZERO;
    const regularHours = isPh
      ? new Decimal(defaultHours)
      : isHalf
        ? new Decimal(defaultHours).times("0.5")
        : ZERO;
    return {
      date: cell.date,
      regularHours,
      regularDays,
      otHours: ZERO,
      weekendHours: ZERO,
      status: cell.status,
    };
  }
  const h = new Decimal(cell.hours.toString());
  if (h.lessThanOrEqualTo(0)) {
    return {
      date: cell.date,
      regularHours: ZERO,
      regularDays: ZERO,
      otHours: ZERO,
      weekendHours: ZERO,
      status: null,
    };
  }
  if (isWeekendUtc(cell.date)) {
    return {
      date: cell.date,
      regularHours: ZERO,
      regularDays: ZERO,
      otHours: ZERO,
      weekendHours: h,
      status: null,
    };
  }
  const cap = new Decimal(defaultHours);
  const regular = Decimal.min(h, cap);
  const ot = h.greaterThan(cap) ? h.minus(cap) : ZERO;
  return {
    date: cell.date,
    regularHours: regular,
    regularDays: regular.dividedBy(cap),
    otHours: ot,
    weekendHours: ZERO,
    status: null,
  };
}

export function splitEntries(
  entries: DayCell[],
  defaultHours: number,
): SplitTotals {
  let regularDays = new Decimal(0);
  let otHours = new Decimal(0);
  let weekendHours = new Decimal(0);
  for (const cell of entries) {
    const s = splitCell(cell, defaultHours);
    regularDays = regularDays.plus(s.regularDays);
    otHours = otHours.plus(s.otHours);
    weekendHours = weekendHours.plus(s.weekendHours);
  }
  return { regularDays, otHours, weekendHours };
}
