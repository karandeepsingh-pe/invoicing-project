import { describe, expect, it } from "vitest";
import { RateCategory } from "@prisma/client";
import { validateAssignment } from "../../src/lib/domain/assignment-validation";

const D = (s: string) => new Date(`${s}T00:00:00Z`);

const projectTmBand2 = {
  band: 2,
  effectiveFrom: D("2026-01-01"),
  effectiveTo: null,
  rateSubCategory: { rateCategory: RateCategory.PROJECT_TM },
};

describe("validateAssignment", () => {
  const baseInputs = {
    technicianId: "tech_1",
    technicianBand: 2,
    rateCategory: RateCategory.PROJECT_TM,
    startDate: D("2026-06-01"),
    endDate: null,
    accountRates: [projectTmBand2],
    existingTechnicianAssignments: [],
  };

  it("ok when an active rate row matches category + band", () => {
    expect(validateAssignment(baseInputs).ok).toBe(true);
  });

  it("blocks when no rate row exists for the technician's band", () => {
    const result = validateAssignment({
      ...baseInputs,
      technicianBand: 3,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("NO_RATE_CARD");
  });

  it("blocks when no rate row exists for the category", () => {
    const result = validateAssignment({
      ...baseInputs,
      rateCategory: RateCategory.DEDICATED,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("NO_RATE_CARD");
  });

  it("blocks when rate row window is past", () => {
    const result = validateAssignment({
      ...baseInputs,
      accountRates: [
        {
          ...projectTmBand2,
          effectiveFrom: D("2024-01-01"),
          effectiveTo: D("2025-01-01"),
        },
      ],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("NO_RATE_CARD");
  });

  it("blocks a second open-ended DEDICATED for the same technician", () => {
    const result = validateAssignment({
      ...baseInputs,
      rateCategory: RateCategory.DEDICATED,
      accountRates: [
        {
          ...projectTmBand2,
          rateSubCategory: { rateCategory: RateCategory.DEDICATED },
        },
      ],
      existingTechnicianAssignments: [
        { id: "a1", rateCategory: RateCategory.DEDICATED, endDate: null },
      ],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("DEDICATED_ALREADY_ASSIGNED");
  });

  it("allows a second DEDICATED if the existing one is closed", () => {
    const result = validateAssignment({
      ...baseInputs,
      rateCategory: RateCategory.DEDICATED,
      accountRates: [
        {
          ...projectTmBand2,
          rateSubCategory: { rateCategory: RateCategory.DEDICATED },
        },
      ],
      existingTechnicianAssignments: [
        { id: "a1", rateCategory: RateCategory.DEDICATED, endDate: D("2026-05-31") },
      ],
    });
    expect(result.ok).toBe(true);
  });

  it("allows multiple non-DEDICATED assignments", () => {
    const result = validateAssignment({
      ...baseInputs,
      existingTechnicianAssignments: [
        { id: "a1", rateCategory: RateCategory.PROJECT_TM, endDate: null },
      ],
    });
    expect(result.ok).toBe(true);
  });
});
