export type BookingWindow = {
  startDateTime: Date;
  endDateTime: Date;
};

/**
 * Half-open [start, end) overlap. Two windows conflict only if each starts
 * strictly before the other ends — so windows that merely TOUCH (one ends
 * exactly when the next begins, e.g. 09:00–12:00 and 12:00–14:00) do NOT
 * conflict. This is the same half-open convention used by the rate resolver.
 */
export function rangesOverlap(
  aStart: Date,
  aEnd: Date,
  bStart: Date,
  bEnd: Date,
): boolean {
  return aStart.getTime() < bEnd.getTime() && bStart.getTime() < aEnd.getTime();
}

/** Existing windows that conflict with the candidate window. */
export function findOverlaps<T extends BookingWindow>(
  candidate: BookingWindow,
  existing: readonly T[],
): T[] {
  return existing.filter((e) =>
    rangesOverlap(
      candidate.startDateTime,
      candidate.endDateTime,
      e.startDateTime,
      e.endDateTime,
    ),
  );
}
