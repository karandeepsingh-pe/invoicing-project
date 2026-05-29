// Pure date utilities for invoice period math.
// All dates are UTC day-only; callers should construct Date objects with
// Date.UTC(...) to avoid local timezone drift.

export type MonthRange = {
  /** First day of month, UTC midnight. */
  start: Date;
  /** First day of NEXT month, UTC midnight — exclusive upper bound. */
  end: Date;
};

export function monthRange(year: number, month: number): MonthRange {
  if (month < 1 || month > 12) {
    throw new Error(`monthRange: month out of range: ${month}`);
  }
  const start = new Date(Date.UTC(year, month - 1, 1));
  const end = new Date(Date.UTC(year, month, 1));
  return { start, end };
}

export function lastDayOfMonth(year: number, month: number): Date {
  return new Date(Date.UTC(year, month, 0));
}

export function isWeekend(d: Date): boolean {
  const dow = d.getUTCDay();
  return dow === 0 || dow === 6;
}

export function daysInRange({ start, end }: MonthRange): Date[] {
  const out: Date[] = [];
  for (
    let d = new Date(start.getTime());
    d.getTime() < end.getTime();
    d.setUTCDate(d.getUTCDate() + 1)
  ) {
    out.push(new Date(d.getTime()));
  }
  return out;
}

function toUtcDayKey(d: Date): string {
  return `${d.getUTCFullYear()}-${d.getUTCMonth()}-${d.getUTCDate()}`;
}

/**
 * Count working days (Mon–Fri) inside [start, end), excluding any PH dates
 * that themselves fall on a weekday in the range. PH dates supplied that
 * land on weekends or outside the range are ignored.
 */
export function businessDaysInRange(range: MonthRange, phDates: Date[]): number {
  const phKeys = new Set(
    phDates
      .filter((d) => !isWeekend(d) && d >= range.start && d < range.end)
      .map(toUtcDayKey),
  );
  let count = 0;
  for (const d of daysInRange(range)) {
    if (isWeekend(d)) continue;
    if (phKeys.has(toUtcDayKey(d))) continue;
    count += 1;
  }
  return count;
}
