import type { Assignment, AssignmentSlaTier } from "@prisma/client";
import { RateCategory } from "@prisma/client";
import { ratesForTechnician, type RateWithSubCat } from "./account-rate-resolver";
import { flagForCategory, type TechnicianFlags } from "./technician-pools";

export type AssignmentValidationResult =
  | { ok: true }
  | {
      ok: false;
      reason:
        | "NO_RATE_CARD"
        | "DEDICATED_ALREADY_ASSIGNED"
        | "NOT_IN_POOL"
        | "DEDICATED_LOCKS_OUT"
        | "BACKFILL_NOT_ALLOWED";
      message: string;
    };

export type AssignmentValidationInput = {
  technicianId: string;
  technicianBand: number;
  rateCategory: RateCategory;
  startDate: Date;
  endDate: Date | null;
  technicianFlags: TechnicianFlags;
  technicianIsRebadged?: boolean;
  accountRates: RateWithSubCat[];
  existingTechnicianAssignments: Pick<Assignment, "id" | "rateCategory" | "endDate">[];
  slaTier?: AssignmentSlaTier;
  // Resolved org/account policy for the target account. When false, the
  // BACKFILL tier is not permitted. Undefined is treated as allowed.
  backfillAllowed?: boolean;
};

const categoryName: Record<RateCategory, string> = {
  DEDICATED: "Dedicated FTE",
  PROJECT_TM: "Project / T&M",
  DISPATCH_SCHED: "Dispatch",
};

export function validateAssignment(input: AssignmentValidationInput): AssignmentValidationResult {
  const hasActiveDedication = input.existingTechnicianAssignments.some(
    (a) => a.rateCategory === RateCategory.DEDICATED && a.endDate === null,
  );

  // Pool: the technician must be flagged available for this category.
  if (!flagForCategory(input.technicianFlags, input.rateCategory)) {
    return {
      ok: false,
      reason: "NOT_IN_POOL",
      message:
        `Technician is not in the ${categoryName[input.rateCategory]} pool. ` +
        `Turn on their "available for ${categoryName[input.rateCategory]}" flag first.`,
    };
  }

  // Dedication lock-out: an active dedication bars any NEW project/dispatch work
  // (a second dedication is caught by DEDICATED_ALREADY_ASSIGNED below).
  if (hasActiveDedication && input.rateCategory !== RateCategory.DEDICATED) {
    return {
      ok: false,
      reason: "DEDICATED_LOCKS_OUT",
      message:
        "Technician has an active DEDICATED assignment and is locked out of project/dispatch " +
        "work until that dedication ends.",
    };
  }

  // Org policy: the BACKFILL tier is only available where backfill is allowed.
  if (input.slaTier === "BACKFILL" && input.backfillAllowed === false) {
    return {
      ok: false,
      reason: "BACKFILL_NOT_ALLOWED",
      message:
        "This account's organization policy does not allow backfill, so the BACKFILL tier " +
        "cannot be used. Pick No Backfill or None.",
    };
  }

  // Rebadged Dedicated techs bill off their salary, not the account rate sheet —
  // they don't need a rate-card row to be assignable.
  const rebadgedDedicated =
    Boolean(input.technicianIsRebadged) && input.rateCategory === RateCategory.DEDICATED;

  const applicable = ratesForTechnician(
    input.accountRates,
    input.rateCategory,
    input.technicianBand,
    input.startDate,
  );
  if (!rebadgedDedicated && applicable.length === 0) {
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
