import type { TimesheetDayStatus } from "@prisma/client";

export type ExistingEntry = {
  id: string;
  assignmentId: string;
  /** ISO yyyy-mm-dd */
  dateIso: string;
  /** Decimal(6,2) read back as a plain number — exact at 2 decimal places. */
  hours: number;
  status: TimesheetDayStatus | null;
};

export type SubmittedCell = {
  assignmentId: string;
  /** ISO yyyy-mm-dd */
  dateIso: string;
  /** Status cells carry 0 hours; caller coalesces null -> 0 before diffing. */
  hours: number;
  status: TimesheetDayStatus | null;
};

export type TimesheetDiff = {
  toCreate: SubmittedCell[];
  toUpdate: { id: string; hours: number; status: TimesheetDayStatus | null }[];
  toSoftDeleteIds: string[];
  unchangedCount: number;
};

const cents = (h: number): number => Math.round(h * 100);
const keyOf = (assignmentId: string, dateIso: string): string =>
  `${assignmentId}|${dateIso}`;

/**
 * Pure diff between the LIVE timesheet rows for a month and the submitted cells.
 *
 *   present + changed              -> toUpdate
 *   present + identical            -> unchanged (no write)
 *   missing in DB                  -> toCreate
 *   present in DB, absent in input -> toSoftDeleteIds (the cell was cleared)
 *
 * It never produces a hard delete — a cleared cell is soft-deleted so history is
 * recoverable. Keeping this pure lets us exhaustively test the save semantics
 * without a database.
 */
export function diffTimesheetCells(
  existing: ReadonlyArray<ExistingEntry>,
  submitted: ReadonlyArray<SubmittedCell>,
): TimesheetDiff {
  const existingByKey = new Map<string, ExistingEntry>();
  for (const e of existing) existingByKey.set(keyOf(e.assignmentId, e.dateIso), e);

  const toCreate: SubmittedCell[] = [];
  const toUpdate: TimesheetDiff["toUpdate"] = [];
  const submittedKeys = new Set<string>();
  let unchangedCount = 0;

  for (const c of submitted) {
    const key = keyOf(c.assignmentId, c.dateIso);
    submittedKeys.add(key);
    const prior = existingByKey.get(key);
    if (!prior) {
      toCreate.push(c);
      continue;
    }
    const changed = cents(prior.hours) !== cents(c.hours) || prior.status !== c.status;
    if (changed) toUpdate.push({ id: prior.id, hours: c.hours, status: c.status });
    else unchangedCount += 1;
  }

  const toSoftDeleteIds = existing
    .filter((e) => !submittedKeys.has(keyOf(e.assignmentId, e.dateIso)))
    .map((e) => e.id);

  return { toCreate, toUpdate, toSoftDeleteIds, unchangedCount };
}
