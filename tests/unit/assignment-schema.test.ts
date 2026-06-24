import { describe, expect, it } from "vitest";
import {
  assignmentBulkCreateSchema,
  assignmentCreateSchema,
} from "@/lib/schemas/assignment";

describe("assignment end-date requirement", () => {
  const baseBulk = { technicianIds: ["t1"], clientAccountId: "a1", startDate: "2026-03-01" };
  const baseSingle = { technicianId: "t1", clientAccountId: "a1", startDate: "2026-03-01" };

  it("Dedicated may be open-ended (no end date)", () => {
    expect(
      assignmentBulkCreateSchema.safeParse({ ...baseBulk, rateCategory: "DEDICATED" }).success,
    ).toBe(true);
    expect(
      assignmentCreateSchema.safeParse({ ...baseSingle, rateCategory: "DEDICATED" }).success,
    ).toBe(true);
  });

  it("Project / Scheduled / Dispatch require an end date", () => {
    for (const cat of ["PROJECT_TM", "SCHEDULED", "DISPATCH_SCHED"] as const) {
      expect(
        assignmentBulkCreateSchema.safeParse({ ...baseBulk, rateCategory: cat }).success,
      ).toBe(false);
      expect(
        assignmentBulkCreateSchema.safeParse({ ...baseBulk, rateCategory: cat, endDate: "2026-03-31" })
          .success,
      ).toBe(true);
      expect(
        assignmentCreateSchema.safeParse({ ...baseSingle, rateCategory: cat, endDate: "2026-03-31" })
          .success,
      ).toBe(true);
    }
  });

  it("end date must be after start date", () => {
    expect(
      assignmentBulkCreateSchema.safeParse({
        ...baseBulk,
        rateCategory: "PROJECT_TM",
        endDate: "2026-02-01",
      }).success,
    ).toBe(false);
  });
});
