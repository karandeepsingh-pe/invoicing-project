// Pure month-scoping logic for the timesheet grid. Extracted so the invariants
// can be unit-tested without a database: a soft-delete applied in one month is
// provably invisible to every other month, an un-entered month is never treated
// as "deleted", and a restore never revives two rows for one (assignment, day).
import type { MonthRange } from "@/lib/invoice/period";

/** True when a UTC day-date falls within [range.start, range.end). */
export function isInMonth(date: Date, range: MonthRange): boolean {
  const t = date.getTime();
  return t >= range.start.getTime() && t < range.end.getTime();
}

export type EntryLite = {
  assignmentId: string;
  date: Date;
  deletedAt: Date | null;
};

export type MonthCounts = {
  liveCountById: Map<string, number>;
  deletedCountById: Map<string, number>;
};

/**
 * Count this month's timesheet entries per assignment, split into live vs
 * soft-deleted. Entries whose `date` is outside the month are ignored, so a
 * delete applied in another month contributes nothing here.
 */
export function monthEntryCounts(entries: EntryLite[], range: MonthRange): MonthCounts {
  const liveCountById = new Map<string, number>();
  const deletedCountById = new Map<string, number>();
  for (const e of entries) {
    if (!isInMonth(e.date, range)) continue;
    const target = e.deletedAt === null ? liveCountById : deletedCountById;
    target.set(e.assignmentId, (target.get(e.assignmentId) ?? 0) + 1);
  }
  return { liveCountById, deletedCountById };
}

export type MonthPartition = {
  activeIds: Set<string>;
  deletedIds: Set<string>;
  deletedCountById: Map<string, number>;
};

/**
 * Classify each assignment for the month:
 *  - has live entries, OR has no entries at all -> ACTIVE (shown in the grid).
 *  - no live entries but at least one soft-deleted -> DELETED (the recoverable
 *    "Deleted this month" section).
 * A never-entered assignment (0 live, 0 deleted) is ACTIVE, never "deleted".
 */
export function partitionMonthAssignments(
  assignmentIds: string[],
  counts: MonthCounts,
): MonthPartition {
  const activeIds = new Set<string>();
  const deletedIds = new Set<string>();
  for (const id of assignmentIds) {
    const live = counts.liveCountById.get(id) ?? 0;
    const deleted = counts.deletedCountById.get(id) ?? 0;
    if (live > 0 || deleted === 0) activeIds.add(id);
    else deletedIds.add(id);
  }
  return { activeIds, deletedIds, deletedCountById: counts.deletedCountById };
}

export type RestorableRow = { id: string; key: string };

/**
 * Pick the row ids to un-soft-delete from a set of deleted rows that share a
 * partial unique index on `key` (... WHERE deletedAt IS NULL). At most ONE row
 * per key is revived (callers pass rows newest-first, so the most recent wins),
 * and any key that already has a LIVE row is skipped. Reviving two rows for one
 * key would violate the partial unique index, so this guards against that.
 */
export function pickRestorableIds(
  deletedNewestFirst: RestorableRow[],
  liveKeys: Set<string>,
): string[] {
  const seen = new Set<string>();
  const ids: string[] = [];
  for (const row of deletedNewestFirst) {
    if (liveKeys.has(row.key) || seen.has(row.key)) continue;
    seen.add(row.key);
    ids.push(row.id);
  }
  return ids;
}

function isWeekendIso(iso: string): boolean {
  const dow = new Date(`${iso}T00:00:00.000Z`).getUTCDay();
  return dow === 0 || dow === 6;
}

/**
 * The ISO day strings within `days` between `fromIso` and `toIso` inclusive,
 * order-independent (swaps if from > to). When `weekdaysOnly`, Saturdays and
 * Sundays are dropped. Used by the per-row "Fill range" timesheet convenience.
 * Returns [] if either bound is not in `days`.
 */
export function daysInFillRange(
  days: string[],
  fromIso: string,
  toIso: string,
  weekdaysOnly: boolean,
): string[] {
  const a = days.indexOf(fromIso);
  const b = days.indexOf(toIso);
  if (a < 0 || b < 0) return [];
  const lo = Math.min(a, b);
  const hi = Math.max(a, b);
  return days.slice(lo, hi + 1).filter((d) => !(weekdaysOnly && isWeekendIso(d)));
}
