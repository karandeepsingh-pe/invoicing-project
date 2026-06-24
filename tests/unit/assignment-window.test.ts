import { describe, expect, it } from "vitest";
import { isWithinWindow, toDayIso } from "../../src/lib/invoice/assignment-window";

describe("isWithinWindow", () => {
  it("includes the start and end days (end is inclusive)", () => {
    expect(isWithinWindow("2026-06-01", "2026-06-01", "2026-06-16")).toBe(true);
    expect(isWithinWindow("2026-06-16", "2026-06-01", "2026-06-16")).toBe(true);
  });

  it("excludes days before start and after end", () => {
    expect(isWithinWindow("2026-05-31", "2026-06-01", "2026-06-16")).toBe(false);
    expect(isWithinWindow("2026-06-17", "2026-06-01", "2026-06-16")).toBe(false);
  });

  it("treats a null end as open-ended (no upper bound)", () => {
    expect(isWithinWindow("2026-12-31", "2026-06-01", null)).toBe(true);
    expect(isWithinWindow("2026-05-31", "2026-06-01", null)).toBe(false);
  });

  it("toDayIso renders a DATE as YYYY-MM-DD (UTC)", () => {
    expect(toDayIso(new Date("2026-06-16T00:00:00.000Z"))).toBe("2026-06-16");
  });
});
