import type { RateBasis } from "@prisma/client";

// Effective-policy resolution for the Org -> Account hierarchy. This is the one
// resolution path used by the invoice engine, the coverage guard, assignment
// validation, and the admin UI: an account override wins, otherwise the org
// value is inherited.

// The org's policy values (always concrete).
export type OrgPolicy = {
  backfillAllowed: boolean;
  rateBasis: RateBasis;
};

// The account's overrides. NULL on a field means "inherit the org value".
export type AccountPolicyOverride = {
  backfillAllowedOverride: boolean | null;
  rateBasisOverride: RateBasis | null;
};

export type EffectivePolicy = {
  backfillAllowed: boolean;
  rateBasis: RateBasis;
};

/**
 * Resolve the effective policy for an account. `??` falls back only on
 * null/undefined, so an explicit `false` override is honored (it does not
 * fall through to the org's `true`). Each field resolves independently.
 */
export function resolvePolicy(
  org: OrgPolicy,
  account: AccountPolicyOverride,
): EffectivePolicy {
  return {
    backfillAllowed: account.backfillAllowedOverride ?? org.backfillAllowed,
    rateBasis: account.rateBasisOverride ?? org.rateBasis,
  };
}
