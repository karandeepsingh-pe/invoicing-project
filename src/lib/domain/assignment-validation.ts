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
        | "MISSING_BACKFILL_TIER";
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
  // The assignment's billing tier, derived from the technician's backfill trait
  // (see deriveAssignmentSlaTier). DEDICATED work requires a real tier.
  slaTier?: AssignmentSlaTier;
};

const categoryName: Record<RateCategory, string> = {
  DEDICATED: "Dedicated FTE",
  PROJECT_TM: "Project / T&M",
  DISPATCH_SCHED: "Dispatch",
  SCHEDULED: "Scheduled Visit",
};

/**
 * An assignment's billing tier is the technician's backfill trait, but only for
 * DEDICATED work. Project / Dispatch assignments are always NONE regardless of
 * what the technician carries. The assignment's own category wins, because a
 * technician can be assigned outside their (display-only) primaryCategory.
 */
export function deriveAssignmentSlaTier(
  rateCategory: RateCategory,
  techDefaultSlaTier: AssignmentSlaTier,
): AssignmentSlaTier {
  return rateCategory === RateCategory.DEDICATED ? techDefaultSlaTier : "NONE";
}

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

  // Rebadged Dedicated techs bill off their salary, not the account rate sheet —
  // they don't need a rate-card row to be assignable.
  const rebadgedDedicated =
    Boolean(input.technicianIsRebadged) && input.rateCategory === RateCategory.DEDICATED;

  // Backfill tier rides on the technician now. A DEDICATED assignment must resolve
  // to a real tier (BACKFILL / NO_BACKFILL) or the rate lookup can't pick a row and
  // the row prices at 0. Rebadged techs bill off salary, so their tier is irrelevant.
  if (
    input.rateCategory === RateCategory.DEDICATED &&
    !rebadgedDedicated &&
    input.slaTier !== "BACKFILL" &&
    input.slaTier !== "NO_BACKFILL"
  ) {
    return {
      ok: false,
      reason: "MISSING_BACKFILL_TIER",
      message:
        "This technician has no backfill tier set. Open the technician, set Primary category to " +
        "Dedicated and pick Backfill or No Backfill, then assign.",
    };
  }

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
