import type { Assignment, RateCard } from "@prisma/client";
import { TechType } from "@prisma/client";
import { filterActiveForTechType } from "./rate-card-resolver";

export type AssignmentValidationResult =
  | { ok: true }
  | { ok: false; reason: "NO_RATE_CARD" | "FTE_ALREADY_ASSIGNED"; message: string };

export type AssignmentValidationInput = {
  technicianId: string;
  techType: TechType;
  startDate: Date;
  endDate: Date | null;
  accountRateCards: Pick<RateCard, "techType" | "effectiveFrom" | "effectiveTo">[];
  existingTechnicianAssignments: Pick<Assignment, "id" | "techType" | "endDate">[];
};

export function validateAssignment(input: AssignmentValidationInput): AssignmentValidationResult {
  const activeForType = filterActiveForTechType(
    input.accountRateCards,
    input.techType,
    input.startDate,
  );
  if (activeForType.length === 0) {
    return {
      ok: false,
      reason: "NO_RATE_CARD",
      message:
        `No active rate card for ${input.techType} on ${input.startDate.toISOString().slice(0, 10)}. ` +
        `Add a rate card to this account first.`,
    };
  }

  if (input.techType === TechType.FTE && input.endDate === null) {
    const conflict = input.existingTechnicianAssignments.find(
      (a) => a.techType === TechType.FTE && a.endDate === null,
    );
    if (conflict) {
      return {
        ok: false,
        reason: "FTE_ALREADY_ASSIGNED",
        message: "Technician already has an active FTE assignment. End the existing one first.",
      };
    }
  }

  return { ok: true };
}
