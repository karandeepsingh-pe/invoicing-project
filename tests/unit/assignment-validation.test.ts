import { describe, expect, it } from "vitest";
import { TechType } from "@prisma/client";
import { validateAssignment } from "../../src/lib/domain/assignment-validation";

const D = (s: string) => new Date(`${s}T00:00:00Z`);

describe("validateAssignment", () => {
  const baseInputs = {
    technicianId: "tech_1",
    techType: TechType.FTE,
    startDate: D("2026-06-01"),
    endDate: null,
    accountRateCards: [
      { techType: TechType.FTE, effectiveFrom: D("2026-01-01"), effectiveTo: null },
    ],
    existingTechnicianAssignments: [],
  };

  it("ok when an active rate card exists and no FTE conflict", () => {
    expect(validateAssignment(baseInputs).ok).toBe(true);
  });

  it("blocks when no rate card matches the tech type", () => {
    const result = validateAssignment({
      ...baseInputs,
      techType: TechType.DISPATCH,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("NO_RATE_CARD");
  });

  it("blocks when rate card window is past", () => {
    const result = validateAssignment({
      ...baseInputs,
      accountRateCards: [
        { techType: TechType.FTE, effectiveFrom: D("2024-01-01"), effectiveTo: D("2025-01-01") },
      ],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("NO_RATE_CARD");
  });

  it("blocks a second open-ended FTE for the same technician", () => {
    const result = validateAssignment({
      ...baseInputs,
      existingTechnicianAssignments: [
        { id: "a1", techType: TechType.FTE, endDate: null },
      ],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("FTE_ALREADY_ASSIGNED");
  });

  it("allows a second FTE if the existing one is closed", () => {
    const result = validateAssignment({
      ...baseInputs,
      existingTechnicianAssignments: [
        { id: "a1", techType: TechType.FTE, endDate: D("2026-05-31") },
      ],
    });
    expect(result.ok).toBe(true);
  });

  it("allows multiple non-FTE assignments", () => {
    const result = validateAssignment({
      ...baseInputs,
      techType: TechType.DISPATCH,
      accountRateCards: [
        { techType: TechType.DISPATCH, effectiveFrom: D("2026-01-01"), effectiveTo: null },
      ],
      existingTechnicianAssignments: [
        { id: "a1", techType: TechType.DISPATCH, endDate: null },
      ],
    });
    expect(result.ok).toBe(true);
  });
});
