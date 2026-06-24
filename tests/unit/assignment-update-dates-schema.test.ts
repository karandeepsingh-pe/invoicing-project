import { describe, expect, it } from "vitest";
import { assignmentUpdateDatesSchema } from "../../src/lib/schemas/assignment";

describe("assignmentUpdateDatesSchema", () => {
  it("accepts start before end", () => {
    const r = assignmentUpdateDatesSchema.safeParse({
      id: "a1",
      startDate: "2026-05-01",
      endDate: "2026-06-16",
    });
    expect(r.success).toBe(true);
  });

  it("accepts a same-day window (end inclusive)", () => {
    const r = assignmentUpdateDatesSchema.safeParse({
      id: "a1",
      startDate: "2026-06-16",
      endDate: "2026-06-16",
    });
    expect(r.success).toBe(true);
  });

  it("accepts a blank end (ongoing)", () => {
    const r = assignmentUpdateDatesSchema.safeParse({ id: "a1", startDate: "2026-05-01", endDate: "" });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.endDate).toBeUndefined();
  });

  it("rejects an end before the start", () => {
    const r = assignmentUpdateDatesSchema.safeParse({
      id: "a1",
      startDate: "2026-06-16",
      endDate: "2026-06-01",
    });
    expect(r.success).toBe(false);
  });

  it("rejects a non-ISO date", () => {
    const r = assignmentUpdateDatesSchema.safeParse({ id: "a1", startDate: "06/16/2026" });
    expect(r.success).toBe(false);
  });
});
