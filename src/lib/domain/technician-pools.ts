import { RateCategory } from "@prisma/client";

export type TechnicianFlags = {
  isAvailableForDedicated: boolean;
  isAvailableForProject: boolean;
  isAvailableForDispatch: boolean;
};

/** Is the technician flagged available for this invoice category? */
export function flagForCategory(
  flags: TechnicianFlags,
  category: RateCategory,
): boolean {
  switch (category) {
    case RateCategory.DEDICATED:
      return flags.isAvailableForDedicated;
    case RateCategory.PROJECT_TM:
      return flags.isAvailableForProject;
    case RateCategory.DISPATCH_SCHED:
      return flags.isAvailableForDispatch;
    default:
      return false;
  }
}

/**
 * Categories a technician may take a NEW assignment in.
 *
 * An active DEDICATED assignment LOCKS the technician out of everything (they
 * can't be in two places, and a second dedication is barred by the single-active
 * rule) — so the eligible set is empty until that dedication ends. Otherwise it's
 * every category the technician is flagged for.
 */
export function eligibleCategories(
  flags: TechnicianFlags,
  hasActiveDedication: boolean,
): RateCategory[] {
  if (hasActiveDedication) return [];
  return (Object.values(RateCategory) as RateCategory[]).filter((c) =>
    flagForCategory(flags, c),
  );
}
