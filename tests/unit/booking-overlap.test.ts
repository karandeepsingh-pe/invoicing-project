import { describe, expect, it } from "vitest";
import { findOverlaps, rangesOverlap } from "../../src/lib/domain/booking-overlap";

const T = (s: string) => new Date(`2026-05-04T${s}:00.000Z`);

describe("rangesOverlap (half-open)", () => {
  it("detects a true overlap", () => {
    expect(rangesOverlap(T("09:00"), T("15:00"), T("12:00"), T("14:00"))).toBe(true);
  });

  it("treats touching ends as NON-overlapping (09–12 vs 12–14)", () => {
    expect(rangesOverlap(T("09:00"), T("12:00"), T("12:00"), T("14:00"))).toBe(false);
  });

  it("allows two non-overlapping windows on the same day (AM vs PM)", () => {
    // 3h morning visit vs 4h afternoon visit, same tech, different accounts.
    expect(rangesOverlap(T("08:00"), T("11:00"), T("13:00"), T("17:00"))).toBe(false);
  });

  it("detects containment", () => {
    expect(rangesOverlap(T("09:00"), T("17:00"), T("11:00"), T("12:00"))).toBe(true);
  });

  it("is symmetric", () => {
    expect(rangesOverlap(T("12:00"), T("14:00"), T("09:00"), T("15:00"))).toBe(true);
  });
});

describe("findOverlaps", () => {
  const existing = [
    { id: "morning", startDateTime: T("08:00"), endDateTime: T("11:00") },
    { id: "afternoon", startDateTime: T("13:00"), endDateTime: T("17:00") },
  ];

  it("returns only the conflicting windows", () => {
    const hits = findOverlaps({ startDateTime: T("10:00"), endDateTime: T("14:00") }, existing);
    expect(hits.map((h) => h.id)).toEqual(["morning", "afternoon"]);
  });

  it("returns empty when the candidate fits in the gap", () => {
    const hits = findOverlaps({ startDateTime: T("11:00"), endDateTime: T("13:00") }, existing);
    expect(hits).toHaveLength(0);
  });
});
