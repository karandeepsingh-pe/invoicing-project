import type { Assignment } from "@prisma/client";
import { RateCategory } from "@prisma/client";
import { ratesForTechnician, type RateWithSubCat } from "./account-rate-resolver";

export type AssignmentValidationResult =
  | { ok: true }
  | { ok: false; reason: "NO_RATE_CARD" | "DEDICATED_ALREADY_ASSIGNED"; message: string };

export type AssignmentValidationInput = {
  technicianId: string;
  technicianBand: number;
  rateCategory: RateCategory;
  startDate: Date;
  endDate: Date | null;
  accountRates: RateWithSubCat[];
  existingTechnicianAssignments: Pick<Assignment, "id" | "rateCategory" | "endDate">[];
};

export function validateAssignment(input: AssignmentValidationInput): AssignmentValidationResult {
  const applicable = ratesForTechnician(
    input.accountRates,
    input.rateCategory,
    input.technicianBand,
    input.startDate,
  );
  if (applicable.length === 0) {
    return {
      ok: false,
      reason: "NO_RATE_CARD",
      message:
        `No active rate cards on this account for ${input.rateCategory} at band ${input.technicianBand} on ` +
        `${input.startDate.toISOString().slice(0, 10)}. Add at least one rate row for that category and band first.`,
    };
  }

  if (input.rateCategory === RateCategory.DEDICATED && input.endDate === null) {
    const conflict = input.existingTechnicianAssignments.find(
      (a) => a.rateCategory === RateCategory.DEDICATED && a.endDate === null,
    );
    if (conflict) {
      return {
        ok: false,
        reason: "DEDICATED_ALREADY_ASSIGNED",
        message:
          "Technician already has an active DEDICATED assignment. End the existing one before starting a new one.",
      };
    }
  }

  return { ok: true };
}
