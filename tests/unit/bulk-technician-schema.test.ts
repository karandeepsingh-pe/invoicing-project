import { describe, expect, it } from "vitest";
import { bulkTechnicianRowSchema } from "@/lib/schemas/bulk-technician-upload";

const base = {
  orgName: "Acme Corp",
  firstName: "Jane",
  lastName: "Doe",
  primaryCategory: "Dedicated",
  band: "2",
};

describe("bulkTechnicianRowSchema", () => {
  it("parses a valid Dedicated row with tier/boolean/number synonyms", () => {
    const r = bulkTechnicianRowSchema.safeParse({
      ...base,
      defaultSlaTier: "With Backfill",
      isAvailableForDedicated: "yes",
      annualSalary: "74100",
    });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.primaryCategory).toBe("DEDICATED");
      expect(r.data.defaultSlaTier).toBe("BACKFILL");
      expect(r.data.isAvailableForDedicated).toBe(true);
      expect(r.data.band).toBe(2);
      expect(r.data.annualSalary).toBe(74100);
    }
  });

  it("maps category synonyms", () => {
    expect(bulkTechnicianRowSchema.parse({ ...base, primaryCategory: "Project / T&M" }).primaryCategory).toBe("PROJECT_TM");
    expect(bulkTechnicianRowSchema.parse({ ...base, primaryCategory: "SV" }).primaryCategory).toBe("SCHEDULED");
    expect(bulkTechnicianRowSchema.parse({ ...base, primaryCategory: "dispatch" }).primaryCategory).toBe("DISPATCH_SCHED");
  });

  it("defaults tier to NONE and booleans to false when blank", () => {
    const r = bulkTechnicianRowSchema.parse({ ...base });
    expect(r.defaultSlaTier).toBe("NONE");
    expect(r.isAvailableForDedicated).toBe(false);
    expect(r.isRebadged).toBe(false);
  });

  it("maps 'No Backfill' to NO_BACKFILL", () => {
    expect(bulkTechnicianRowSchema.parse({ ...base, defaultSlaTier: "No Backfill" }).defaultSlaTier).toBe("NO_BACKFILL");
  });

  it("rejects an out-of-range band, a bad category, and a missing name", () => {
    expect(bulkTechnicianRowSchema.safeParse({ ...base, band: "9" }).success).toBe(false);
    expect(bulkTechnicianRowSchema.safeParse({ ...base, primaryCategory: "Nope" }).success).toBe(false);
    expect(bulkTechnicianRowSchema.safeParse({ ...base, firstName: "" }).success).toBe(false);
  });

  it("normalizes placeholder Employee IDs to null (NA / N/A / - / none / blank)", () => {
    for (const v of ["NA", "n/a", "N/A", "-", "none", "NIL", "null", "", "  na  "]) {
      expect(bulkTechnicianRowSchema.parse({ ...base, employeeId: v }).employeeId).toBeNull();
    }
  });

  it("keeps a real Employee ID verbatim (trimmed)", () => {
    expect(bulkTechnicianRowSchema.parse({ ...base, employeeId: " ACME-001 " }).employeeId).toBe("ACME-001");
    expect(bulkTechnicianRowSchema.parse({ ...base, employeeId: "NA-7" }).employeeId).toBe("NA-7");
  });
});
