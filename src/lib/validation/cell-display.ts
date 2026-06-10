// Display helpers for the Dedicated FTE timesheet grid.
//
// Splits the "what text does this cell show" decision out of the React grid so
// it is pure and unit-testable. The key rule lives in
// `reconcileDedicatedCellText`: the LIVE holiday master is authoritative over an
// *untouched* day snapshot, but real work (custom hours or an explicit non-PH
// status) always wins over the master. This is what makes a PH cell track the
// holidays master after it is added, moved, or deleted.

import type { StatusCode } from "./cell";

// A single grid cell as loaded from the DB: either a numeric `hours` value
// (status null) or a `status` code (hours null). Shared with the grid component.
export type GridCell = {
  hours: number | null;
  status: StatusCode | null;
};

/** Render a loaded cell as grid text: status code, formatted hours, or blank. */
export function cellToText(cell: GridCell | undefined): string {
  if (!cell) return "";
  if (cell.status) return cell.status;
  if (cell.hours === null) return "";
  return Number.isInteger(cell.hours)
    ? String(cell.hours)
    : cell.hours.toFixed(2).replace(/\.?0+$/, "");
}

function dayOfWeekUtc(date: string): number {
  return new Date(`${date}T00:00:00.000Z`).getUTCDay();
}

/** True for an ISO date (YYYY-MM-DD) that falls on a Saturday or Sunday (UTC). */
export function isWeekend(date: string): boolean {
  const d = dayOfWeekUtc(date);
  return d === 0 || d === 6;
}

/**
 * Decide a Dedicated grid cell's displayed text, with the live holiday master
 * authoritative over an untouched snapshot. Precedence:
 *   1. Weekend            -> preserve a saved value, else blank (holidays never
 *                            add PH on weekends; the weekend bucket is separate).
 *   2. Real work          -> an explicit non-PH status (AB/NA/PTO/HALF_DAY) or
 *                            custom hours (differ from the account default) win.
 *   3. Holiday (weekday)  -> "PH" (covers no entry, untouched default, legacy PH).
 *   4. Stale PH           -> a persisted PH whose date is no longer a holiday
 *                            reverts to the un-entered look (default hours).
 *   5. Fallthrough        -> saved value if any, else the default prefill / blank.
 *
 * Note: a tech who worked exactly `defaultHours` on a now-holiday day is
 * indistinguishable from an untouched default and shows as "PH" — billing-
 * invariant (both credit one paid day), so this is expected, not a defect.
 */
export function reconcileDedicatedCellText(args: {
  saved: GridCell | undefined;
  isHoliday: boolean;
  weekend: boolean;
  defaultHours: number;
  prefillDefaultHours: boolean;
}): string {
  const { saved, isHoliday, weekend, defaultHours, prefillDefaultHours } = args;

  // 1. Weekend: holidays never add PH here. Preserve any saved value, else blank.
  if (weekend) {
    return saved !== undefined ? cellToText(saved) : "";
  }

  // 2. Real work wins over the holiday master.
  const isRealWork =
    saved !== undefined &&
    ((saved.status !== null && saved.status !== "PH") ||
      (saved.status === null &&
        saved.hours !== null &&
        Math.abs(saved.hours - defaultHours) > 1e-9));
  if (isRealWork) {
    return cellToText(saved);
  }

  // 3. Holiday weekday, not real work -> PH.
  if (isHoliday) {
    return "PH";
  }

  // 4. Stale PH: persisted PH on a date that is no longer a holiday.
  if (saved !== undefined && saved.status === "PH") {
    return prefillDefaultHours ? String(defaultHours) : "";
  }

  // 5. Fallthrough: saved value if any, else the default prefill / blank.
  if (saved !== undefined) return cellToText(saved);
  return prefillDefaultHours ? String(defaultHours) : "";
}
