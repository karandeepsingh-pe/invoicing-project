import { describe, expect, it } from "vitest";
import {
  cellToText,
  isWeekend,
  reconcileDedicatedCellText,
  type GridCell,
} from "@/lib/validation/cell-display";

// Reference dates (UTC). May 2026: 1st = Fri (weekday), 2nd = Sat, 19th = Tue.
const WEEKDAY = "2026-05-01";
const SATURDAY = "2026-05-02";
const DEFAULT_HOURS = 8;

function reconcile(
  saved: GridCell | undefined,
  isHoliday: boolean,
  weekend = false,
  prefillDefaultHours = true,
): string {
  return reconcileDedicatedCellText({
    saved,
    isHoliday,
    weekend,
    defaultHours: DEFAULT_HOURS,
    prefillDefaultHours,
  });
}

describe("isWeekend", () => {
  it("Saturday / Sunday are weekend", () => {
    expect(isWeekend("2026-05-02")).toBe(true); // Sat
    expect(isWeekend("2026-05-03")).toBe(true); // Sun
  });
  it("weekdays are not weekend", () => {
    expect(isWeekend("2026-05-01")).toBe(false); // Fri
    expect(isWeekend("2026-05-19")).toBe(false); // Tue
  });
});

describe("cellToText", () => {
  it("status -> code, value -> number, blank -> empty", () => {
    expect(cellToText({ hours: null, status: "PH" })).toBe("PH");
    expect(cellToText({ hours: 8, status: null })).toBe("8");
    expect(cellToText({ hours: 6.5, status: null })).toBe("6.5");
    expect(cellToText({ hours: null, status: null })).toBe("");
    expect(cellToText(undefined)).toBe("");
  });
});

describe("reconcileDedicatedCellText", () => {
  it("holiday weekday with no saved entry -> PH", () => {
    expect(reconcile(undefined, true)).toBe("PH");
  });

  it("holiday weekday with untouched default (8) -> PH", () => {
    expect(reconcile({ hours: 8, status: null }, true)).toBe("PH");
  });

  it("holiday weekday with legacy persisted PH -> PH", () => {
    expect(reconcile({ hours: null, status: "PH" }, true)).toBe("PH");
  });

  it("holiday weekday with custom hours -> keeps the hours (real work wins)", () => {
    expect(reconcile({ hours: 4, status: null }, true)).toBe("4");
  });

  it("holiday weekday with explicit non-PH status -> keeps it (real work wins)", () => {
    expect(reconcile({ hours: null, status: "AB" }, true)).toBe("AB");
    expect(reconcile({ hours: null, status: "PTO" }, true)).toBe("PTO");
    expect(reconcile({ hours: null, status: "HALF_DAY" }, true)).toBe("HALF_DAY");
  });

  it("holiday weekday with exactly defaultHours -> PH (documented invariant)", () => {
    expect(reconcile({ hours: DEFAULT_HOURS, status: null }, true)).toBe("PH");
  });

  it("stale PH (no longer a holiday) -> reverts to default hours", () => {
    expect(reconcile({ hours: null, status: "PH" }, false)).toBe(String(DEFAULT_HOURS));
  });

  it("non-holiday weekday with untouched default -> default unchanged", () => {
    expect(reconcile({ hours: 8, status: null }, false)).toBe("8");
  });

  it("non-holiday weekday with custom hours -> unchanged", () => {
    expect(reconcile({ hours: 10, status: null }, false)).toBe("10");
  });

  it("non-holiday weekday with no entry -> default prefill", () => {
    expect(reconcile(undefined, false)).toBe("8");
  });

  it("weekend never shows PH even if flagged a holiday", () => {
    expect(reconcile(undefined, true, true)).toBe("");
    expect(reconcile({ hours: 6, status: null }, true, true)).toBe("6"); // preserve saved weekend hours
  });

  it("prefillDefaultHours=false (Project/Scheduled path): never PH, blank when un-entered", () => {
    expect(reconcile(undefined, false, false, false)).toBe("");
    // isHoliday is always false for non-Dedicated callers, so a stale PH clears to blank.
    expect(reconcile({ hours: null, status: "PH" }, false, false, false)).toBe("");
  });
});
