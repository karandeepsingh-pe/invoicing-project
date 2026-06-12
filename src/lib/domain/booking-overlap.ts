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

const HOUR_MS = 60 * 60 * 1000;

/**
 * Whole-hour booking envelope for a dispatch visit's In/Out times: floor the
 * In-Time to its hour and ceil the Out-Time to the next hour boundary (an
 * exact HH:00 stays as-is). 09:17–11:40 books 09:00–12:00; 10:00–13:00 books
 * 10:00–13:00. Bookings hold whole-hour slots so the half-open overlap rule
 * lines up across visits (13:00–17:00 never collides with a 10:00–13:00 hold),
 * while the visit row keeps the raw minutes for billing.
 *
 * An Out-Time past 23:00 ceils into the next day (UTC ms arithmetic rolls
 * over). An Out-Time ≤ the In-Time means the visit crossed MIDNIGHT
 * (overnight ticket): the end lands on the next day. Inputs are
 * "YYYY-MM-DD" + "HH:mm" (already zod-validated).
 */
export function bookingEnvelope(
  visitDate: string,
  inTime: string,
  outTime: string,
): { start: Date; end: Date } {
  const dayStart = new Date(`${visitDate}T00:00:00.000Z`).getTime();
  const inMinutes = minutesOf(inTime);
  const rawOutMinutes = minutesOf(outTime);
  const outMinutes = rawOutMinutes <= inMinutes ? rawOutMinutes + 24 * 60 : rawOutMinutes;
  const startHour = Math.floor(inMinutes / 60);
  const endHour = Math.ceil(outMinutes / 60);
  return {
    start: new Date(dayStart + startHour * HOUR_MS),
    end: new Date(dayStart + endHour * HOUR_MS),
  };
}

function minutesOf(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}
