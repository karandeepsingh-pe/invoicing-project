import { describe, expect, it } from "vitest";
import {
  bookingEnvelope,
  findOverlaps,
  rangesOverlap,
} from "../../src/lib/domain/booking-overlap";

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

describe("bookingEnvelope (whole-hour slot from In/Out)", () => {
  const D = "2026-05-19";

  it("exact whole hours pass through (10:00–13:00 -> 10–13)", () => {
    const e = bookingEnvelope(D, "10:00", "13:00");
    expect(e.start.toISOString()).toBe("2026-05-19T10:00:00.000Z");
    expect(e.end.toISOString()).toBe("2026-05-19T13:00:00.000Z");
  });

  it("fractional minutes expand outward (09:17–11:40 -> 09:00–12:00)", () => {
    const e = bookingEnvelope(D, "09:17", "11:40");
    expect(e.start.toISOString()).toBe("2026-05-19T09:00:00.000Z");
    expect(e.end.toISOString()).toBe("2026-05-19T12:00:00.000Z");
  });

  it("sub-hour visit books one full slot (10:05–10:40 -> 10:00–11:00)", () => {
    const e = bookingEnvelope(D, "10:05", "10:40");
    expect(e.start.toISOString()).toBe("2026-05-19T10:00:00.000Z");
    expect(e.end.toISOString()).toBe("2026-05-19T11:00:00.000Z");
  });

  it("late Out-Time ceils into the next day (22:30–23:10 -> 22:00–00:00 next day)", () => {
    const e = bookingEnvelope(D, "22:30", "23:10");
    expect(e.start.toISOString()).toBe("2026-05-19T22:00:00.000Z");
    expect(e.end.toISOString()).toBe("2026-05-20T00:00:00.000Z");
  });

  it("envelopes touching at an hour boundary do NOT conflict (10–13 then 13–17)", () => {
    const a = bookingEnvelope(D, "10:00", "13:00");
    const b = bookingEnvelope(D, "13:00", "17:00");
    expect(rangesOverlap(a.start, a.end, b.start, b.end)).toBe(false);
  });

  it("fractional envelope conflicts where raw times would not (12:50 out books to 13:00... 12:00 in floors to 12:00)", () => {
    // Visit A 10:00–12:50 books 10–13; visit B 12:00–14:00 books 12–14 -> conflict.
    const a = bookingEnvelope(D, "10:00", "12:50");
    const b = bookingEnvelope(D, "12:00", "14:00");
    expect(rangesOverlap(a.start, a.end, b.start, b.end)).toBe(true);
  });
});
