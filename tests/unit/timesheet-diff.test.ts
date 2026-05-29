import { describe, expect, it } from "vitest";
import { TimesheetDayStatus } from "@prisma/client";
import {
  diffTimesheetCells,
  type ExistingEntry,
  type SubmittedCell,
} from "../../src/lib/domain/timesheet-diff";

const existing = (
  id: string,
  assignmentId: string,
  dateIso: string,
  hours: number,
  status: TimesheetDayStatus | null = null,
): ExistingEntry => ({ id, assignmentId, dateIso, hours, status });

const cell = (
  assignmentId: string,
  dateIso: string,
  hours: number,
  status: TimesheetDayStatus | null = null,
): SubmittedCell => ({ assignmentId, dateIso, hours, status });

describe("diffTimesheetCells", () => {
  it("creates a row for a day with no existing entry", () => {
    const diff = diffTimesheetCells([], [cell("a1", "2026-05-04", 8)]);
    expect(diff.toCreate).toHaveLength(1);
    expect(diff.toCreate[0].dateIso).toBe("2026-05-04");
    expect(diff.toUpdate).toHaveLength(0);
    expect(diff.toSoftDeleteIds).toHaveLength(0);
  });

  it("leaves an unchanged cell alone (no write)", () => {
    const diff = diffTimesheetCells(
      [existing("e1", "a1", "2026-05-04", 8)],
      [cell("a1", "2026-05-04", 8)],
    );
    expect(diff.toCreate).toHaveLength(0);
    expect(diff.toUpdate).toHaveLength(0);
    expect(diff.toSoftDeleteIds).toHaveLength(0);
    expect(diff.unchangedCount).toBe(1);
  });

  it("treats 8.50 and 8.5 as identical (2dp precision)", () => {
    const diff = diffTimesheetCells(
      [existing("e1", "a1", "2026-05-04", 8.5)],
      [cell("a1", "2026-05-04", 8.5)],
    );
    expect(diff.toUpdate).toHaveLength(0);
    expect(diff.unchangedCount).toBe(1);
  });

  it("updates a cell whose hours changed", () => {
    const diff = diffTimesheetCells(
      [existing("e1", "a1", "2026-05-04", 8)],
      [cell("a1", "2026-05-04", 10)],
    );
    expect(diff.toUpdate).toEqual([{ id: "e1", hours: 10, status: null }]);
    expect(diff.toCreate).toHaveLength(0);
    expect(diff.toSoftDeleteIds).toHaveLength(0);
  });

  it("updates a cell whose status changed (number -> PH)", () => {
    const diff = diffTimesheetCells(
      [existing("e1", "a1", "2026-05-04", 8)],
      [cell("a1", "2026-05-04", 0, TimesheetDayStatus.PH)],
    );
    expect(diff.toUpdate).toEqual([
      { id: "e1", hours: 0, status: TimesheetDayStatus.PH },
    ]);
  });

  it("soft-deletes a cleared cell (existing row absent from submission)", () => {
    const diff = diffTimesheetCells(
      [
        existing("e1", "a1", "2026-05-03", 5), // Saturday entry, now blanked
        existing("e2", "a1", "2026-05-04", 8),
      ],
      [cell("a1", "2026-05-04", 8)],
    );
    expect(diff.toSoftDeleteIds).toEqual(["e1"]);
    expect(diff.unchangedCount).toBe(1);
  });

  it("never soft-deletes a row that is still submitted", () => {
    const diff = diffTimesheetCells(
      [existing("e1", "a1", "2026-05-04", 8)],
      [cell("a1", "2026-05-04", 10)],
    );
    expect(diff.toSoftDeleteIds).toHaveLength(0);
  });

  it("scopes diffing per assignment (same date, different assignments)", () => {
    const diff = diffTimesheetCells(
      [existing("e1", "a1", "2026-05-04", 8)],
      [cell("a1", "2026-05-04", 8), cell("a2", "2026-05-04", 8)],
    );
    // a1 unchanged; a2 is a new row, not an update of a1.
    expect(diff.toCreate).toHaveLength(1);
    expect(diff.toCreate[0].assignmentId).toBe("a2");
    expect(diff.toUpdate).toHaveLength(0);
    expect(diff.toSoftDeleteIds).toHaveLength(0);
  });

  it("handles a mixed batch: create + update + unchanged + clear", () => {
    const diff = diffTimesheetCells(
      [
        existing("e1", "a1", "2026-05-04", 8), // unchanged
        existing("e2", "a1", "2026-05-05", 8), // -> update to 9
        existing("e3", "a1", "2026-05-03", 4), // cleared (absent)
      ],
      [
        cell("a1", "2026-05-04", 8),
        cell("a1", "2026-05-05", 9),
        cell("a1", "2026-05-06", 8), // new
      ],
    );
    expect(diff.toCreate.map((c) => c.dateIso)).toEqual(["2026-05-06"]);
    expect(diff.toUpdate).toEqual([{ id: "e2", hours: 9, status: null }]);
    expect(diff.toSoftDeleteIds).toEqual(["e3"]);
    expect(diff.unchangedCount).toBe(1);
  });
});
