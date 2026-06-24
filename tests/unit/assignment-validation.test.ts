import { describe, expect, it } from "vitest";
import { RateCategory } from "@prisma/client";
import {
  validateAssignment,
  deriveAssignmentSlaTier,
} from "../../src/lib/domain/assignment-validation";

const D = (s: string) => new Date(`${s}T00:00:00Z`);

const projectTmBand2 = {
  band: 2,
  effectiveFrom: D("2026-01-01"),
  effectiveTo: null,
  rateSubCategory: { rateCategory: RateCategory.PROJECT_TM },
};

describe("validateAssignment", () => {
  const allFlags = {
    isAvailableForDedicated: true,
    isAvailableForProject: true,
    isAvailableForDispatch: true,
  };

  const baseInputs = {
    technicianId: "tech_1",
    technicianBand: 2,
    rateCategory: RateCategory.PROJECT_TM,
    startDate: D("2026-06-01"),
    endDate: null,
    technicianFlags: allFlags,
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
      slaTier: "BACKFILL",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("NO_RATE_CARD");
  });

  it("ok for a salaried Dedicated tech with no band rate card (per-tech annual salary)", () => {
    // No Dedicated rate row on the account, tech not rebadged, but has a per-tech
    // annual salary -> prices off the salary, so it is assignable.
    const result = validateAssignment({
      ...baseInputs,
      rateCategory: RateCategory.DEDICATED,
      slaTier: "BACKFILL",
      technicianAnnualSalary: 74100,
    });
    expect(result.ok).toBe(true);
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
      slaTier: "BACKFILL",
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
      slaTier: "BACKFILL",
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

  it("blocks when the technician is not flagged for the category (NOT_IN_POOL)", () => {
    const result = validateAssignment({
      ...baseInputs,
      technicianFlags: { ...allFlags, isAvailableForProject: false },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("NOT_IN_POOL");
  });

  it("locks out project/dispatch while an active DEDICATED exists (DEDICATED_LOCKS_OUT)", () => {
    const result = validateAssignment({
      ...baseInputs,
      rateCategory: RateCategory.PROJECT_TM,
      existingTechnicianAssignments: [
        { id: "a1", rateCategory: RateCategory.DEDICATED, endDate: null },
      ],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("DEDICATED_LOCKS_OUT");
  });

  it("still allows a NEW DEDICATED to surface DEDICATED_ALREADY_ASSIGNED (not locked out)", () => {
    const result = validateAssignment({
      ...baseInputs,
      rateCategory: RateCategory.DEDICATED,
      slaTier: "BACKFILL",
      accountRates: [
        { ...projectTmBand2, rateSubCategory: { rateCategory: RateCategory.DEDICATED } },
      ],
      existingTechnicianAssignments: [
        { id: "a1", rateCategory: RateCategory.DEDICATED, endDate: null },
      ],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("DEDICATED_ALREADY_ASSIGNED");
  });

  const dedicatedInputs = {
    ...baseInputs,
    rateCategory: RateCategory.DEDICATED,
    slaTier: "BACKFILL" as const,
    accountRates: [
      { ...projectTmBand2, rateSubCategory: { rateCategory: RateCategory.DEDICATED } },
    ],
  };

  it("allows a DEDICATED assignment with the BACKFILL tier", () => {
    expect(validateAssignment({ ...dedicatedInputs, slaTier: "BACKFILL" }).ok).toBe(true);
  });

  it("allows a DEDICATED assignment with the NO_BACKFILL tier", () => {
    expect(validateAssignment({ ...dedicatedInputs, slaTier: "NO_BACKFILL" }).ok).toBe(true);
  });

  it("blocks a DEDICATED assignment whose tier is NONE (MISSING_BACKFILL_TIER)", () => {
    const result = validateAssignment({ ...dedicatedInputs, slaTier: "NONE" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("MISSING_BACKFILL_TIER");
  });

  it("blocks a DEDICATED assignment with no tier provided (MISSING_BACKFILL_TIER)", () => {
    const result = validateAssignment({ ...dedicatedInputs, slaTier: undefined });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("MISSING_BACKFILL_TIER");
  });

  it("does not require a tier for a rebadged DEDICATED technician", () => {
    expect(
      validateAssignment({
        ...dedicatedInputs,
        slaTier: "NONE",
        technicianIsRebadged: true,
      }).ok,
    ).toBe(true);
  });
});

describe("deriveAssignmentSlaTier", () => {
  it("returns the technician tier for DEDICATED work", () => {
    expect(deriveAssignmentSlaTier(RateCategory.DEDICATED, "BACKFILL")).toBe("BACKFILL");
    expect(deriveAssignmentSlaTier(RateCategory.DEDICATED, "NO_BACKFILL")).toBe("NO_BACKFILL");
    expect(deriveAssignmentSlaTier(RateCategory.DEDICATED, "NONE")).toBe("NONE");
  });

  it("forces NONE for non-DEDICATED work regardless of the technician tier", () => {
    expect(deriveAssignmentSlaTier(RateCategory.PROJECT_TM, "BACKFILL")).toBe("NONE");
    expect(deriveAssignmentSlaTier(RateCategory.DISPATCH_SCHED, "NO_BACKFILL")).toBe("NONE");
  });
});
