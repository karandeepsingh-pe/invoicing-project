// An assignment is active on a given day only within [startDate, endDate].
// The end date is INCLUSIVE (an assignment ending on the 16th is billable on
// the 16th; the 17th onward is outside the window → 0). A null end date is
// open-ended (ongoing, no upper bound).
//
// All dates are compared as ISO `YYYY-MM-DD` strings, which sort identically to
// calendar dates — so this is reused by the timesheet grid, every billing
// loader, and the cell-save guard without pulling in Date math.

export function isWithinWindow(
  dateIso: string,
  startIso: string,
  endIso: string | null,
): boolean {
  if (dateIso < startIso) return false;
  if (endIso !== null && dateIso > endIso) return false;
  return true;
}

/** Convenience: a DATE column value (or null end) → ISO day string. */
export function toDayIso(d: Date): string {
  return d.toISOString().slice(0, 10);
}
