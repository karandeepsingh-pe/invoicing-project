import { describe, expect, it } from "vitest";
import { monthRange } from "../../src/lib/invoice/period";
import {
  daysInFillRange,
  isInMonth,
  monthEntryCounts,
  partitionMonthAssignments,
  pickRestorableIds,
  type EntryLite,
} from "../../src/lib/domain/timesheet-month";

const D = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
const may = monthRange(2026, 5);
const march = monthRange(2026, 3);

describe("isInMonth", () => {
  it("includes the first day, excludes the next month's first day", () => {
    expect(isInMonth(D("2026-05-01"), may)).toBe(true);
    expect(isInMonth(D("2026-05-31"), may)).toBe(true);
    expect(isInMonth(D("2026-06-01"), may)).toBe(false);
    expect(isInMonth(D("2026-04-30"), may)).toBe(false);
  });
});

describe("cross-month invariant: a delete in May is invisible to March", () => {
  // A1 = a May assignment whose whole month was soft-deleted.
  // A2 = a March assignment that was never entered.
  const entries: EntryLite[] = ["2026-05-01", "2026-05-04", "2026-05-05"].map((d) => ({
    assignmentId: "A1",
    date: D(d),
    deletedAt: D("2026-05-30"),
  }));
  const ids = ["A1", "A2"];

  it("classifies A1 as DELETED in May (its real month)", () => {
    const p = partitionMonthAssignments(ids, monthEntryCounts(entries, may));
    expect(p.deletedIds.has("A1")).toBe(true);
    expect(p.activeIds.has("A1")).toBe(false);
    expect(p.deletedCountById.get("A1")).toBe(3);
  });

  it("does NOT carry the May delete into March: both rows are ACTIVE/empty there", () => {
    const counts = monthEntryCounts(entries, march);
    expect(counts.liveCountById.size).toBe(0);
    expect(counts.deletedCountById.size).toBe(0);
    const p = partitionMonthAssignments(ids, counts);
    expect(p.activeIds.has("A1")).toBe(true);
    expect(p.activeIds.has("A2")).toBe(true);
    expect(p.deletedIds.size).toBe(0);
  });
});

describe("empty vs deleted classification", () => {
  it("a never-entered assignment is ACTIVE, never deleted", () => {
    const p = partitionMonthAssignments(["A2"], monthEntryCounts([], march));
    expect(p.activeIds.has("A2")).toBe(true);
    expect(p.deletedIds.size).toBe(0);
  });

  it("only-deleted -> deleted; some-live -> active (partial delete stays active)", () => {
    const onlyDeleted: EntryLite[] = [
      { assignmentId: "A1", date: D("2026-05-01"), deletedAt: D("2026-05-30") },
    ];
    const mixed: EntryLite[] = [
      { assignmentId: "A3", date: D("2026-05-01"), deletedAt: null },
      { assignmentId: "A3", date: D("2026-05-04"), deletedAt: D("2026-05-30") },
    ];
    expect(
      partitionMonthAssignments(["A1"], monthEntryCounts(onlyDeleted, may)).deletedIds.has("A1"),
    ).toBe(true);
    expect(
      partitionMonthAssignments(["A3"], monthEntryCounts(mixed, may)).activeIds.has("A3"),
    ).toBe(true);
  });
});

describe("pickRestorableIds (restore dedup, partial-unique-index safety)", () => {
  it("revives at most ONE row per key when duplicates are deleted (newest first wins)", () => {
    const deleted = [
      { id: "e2", key: "A1|2026-05-05" }, // newest first (caller-sorted)
      { id: "e1", key: "A1|2026-05-05" },
    ];
    expect(pickRestorableIds(deleted, new Set())).toEqual(["e2"]);
  });

  it("skips a key that already has a live row", () => {
    const deleted = [{ id: "e1", key: "A1|2026-05-05" }];
    expect(pickRestorableIds(deleted, new Set(["A1|2026-05-05"]))).toEqual([]);
  });

  it("restores exactly one id per distinct key", () => {
    const deleted = [
      { id: "e1", key: "A1|2026-05-05" },
      { id: "e2", key: "A1|2026-05-06" },
      { id: "e3", key: "A1|2026-05-05" }, // duplicate of e1's key
    ];
    expect(pickRestorableIds(deleted, new Set()).sort()).toEqual(["e1", "e2"]);
  });
});

describe("daysInFillRange", () => {
  // Fri 13 .. Fri 20 (2026-03-14 Sat, 2026-03-15 Sun are the weekend).
  const week = [
    "2026-03-13",
    "2026-03-14",
    "2026-03-15",
    "2026-03-16",
    "2026-03-17",
    "2026-03-18",
    "2026-03-19",
    "2026-03-20",
  ];

  it("returns an inclusive weekday range", () => {
    expect(daysInFillRange(week, "2026-03-16", "2026-03-20", true)).toEqual([
      "2026-03-16",
      "2026-03-17",
      "2026-03-18",
      "2026-03-19",
      "2026-03-20",
    ]);
  });

  it("skips Sat/Sun when weekdaysOnly", () => {
    expect(daysInFillRange(week, "2026-03-13", "2026-03-20", true)).toEqual([
      "2026-03-13",
      "2026-03-16",
      "2026-03-17",
      "2026-03-18",
      "2026-03-19",
      "2026-03-20",
    ]);
  });

  it("includes weekends when weekdaysOnly is false", () => {
    expect(daysInFillRange(week, "2026-03-13", "2026-03-20", false)).toEqual(week);
  });

  it("swaps a reversed from/to", () => {
    expect(daysInFillRange(week, "2026-03-20", "2026-03-16", true)).toEqual([
      "2026-03-16",
      "2026-03-17",
      "2026-03-18",
      "2026-03-19",
      "2026-03-20",
    ]);
  });

  it("handles a single-day range", () => {
    expect(daysInFillRange(week, "2026-03-17", "2026-03-17", true)).toEqual(["2026-03-17"]);
  });

  it("returns empty for an all-weekend range with weekdaysOnly", () => {
    expect(daysInFillRange(week, "2026-03-14", "2026-03-15", true)).toEqual([]);
  });

  it("returns empty when a bound is not in the day list", () => {
    expect(daysInFillRange(week, "2026-03-01", "2026-03-20", true)).toEqual([]);
  });
});
