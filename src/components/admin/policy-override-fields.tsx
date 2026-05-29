"use client";

import { RateBasis } from "@prisma/client";
import { SelectField } from "@/components/admin/field";

// Account-level policy override controls. Each select offers "Inherit from org"
// (submits "", resolved to NULL) plus explicit on/off values. The inherited
// label shows the org value so the admin sees what inheriting means.
export function PolicyOverrideFields({
  orgBackfillAllowed,
  orgRateBasis,
  backfillDefault = "",
  rateBasisDefault = "",
}: {
  orgBackfillAllowed: boolean;
  orgRateBasis: RateBasis;
  backfillDefault?: "" | "true" | "false";
  rateBasisDefault?: "" | RateBasis;
}) {
  const orgBackfillLabel = orgBackfillAllowed ? "Allowed" : "Not allowed";
  const orgBasisLabel = orgRateBasis === RateBasis.ANNUAL ? "Annual" : "Day rate";
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <SelectField
        label="Backfill policy"
        name="backfillAllowedOverride"
        defaultValue={backfillDefault}
        hint="Governs the BACKFILL tier and coverage events for this account."
      >
        <option value="">Inherit from org ({orgBackfillLabel})</option>
        <option value="true">Allowed</option>
        <option value="false">Not allowed</option>
      </SelectField>
      <SelectField
        label="Dedicated rate basis"
        name="rateBasisOverride"
        defaultValue={rateBasisDefault}
        hint="Dedicated FTEs only. Annual bills the annual figure at annual / 260 per day. Dispatch and Project are unaffected."
      >
        <option value="">Inherit from org ({orgBasisLabel})</option>
        <option value={RateBasis.DAY_RATE}>Day rate</option>
        <option value={RateBasis.ANNUAL}>Annual</option>
      </SelectField>
    </div>
  );
}
