"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import { RateCategory } from "@prisma/client";
import { createAssignment } from "@/lib/actions/assignment";
import { flagForCategory, type TechnicianFlags } from "@/lib/domain/technician-pools";
import { FormError, SelectField, SubmitButton, TextField } from "@/components/admin/field";
import { useActionToast } from "@/lib/hooks/use-action-toast";
import {
  buildTechDisplayMap,
  formatTechDisplay,
  type LabelableTech,
} from "@/lib/display/technician-label";

const categoryLabel: Record<RateCategory, string> = {
  DEDICATED: "Dedicated",
  PROJECT_TM: "Project / T&M",
  DISPATCH_SCHED: "Dispatch + Scheduled Visit",
};

export type TechOption = LabelableTech & {
  band: number;
  primaryCategory: RateCategory;
  flags: TechnicianFlags;
  /** Non-null when the tech has an active DEDICATED assignment (locks them out). */
  dedicatedToAccountId: string | null;
};

export function AccountAssignmentCreateForm({
  clientAccountId,
  accountLabel,
  technicians,
  onSuccess,
}: {
  clientAccountId: string;
  accountLabel: string;
  technicians: TechOption[];
  onSuccess?: () => void;
}) {
  const [state, action] = useActionState(createAssignment, null);
  const today = new Date().toISOString().slice(0, 10);

  const displayMap = useMemo(() => buildTechDisplayMap(technicians), [technicians]);

  // Category drives the eligible pool: only techs flagged for the chosen category
  // AND not currently dedicated anywhere can take a new assignment here.
  const [category, setCategory] = useState<RateCategory>(RateCategory.DEDICATED);
  const eligibleTechs = useMemo(
    () =>
      technicians.filter(
        (t) => t.dedicatedToAccountId === null && flagForCategory(t.flags, category),
      ),
    [technicians, category],
  );
  const [techId, setTechId] = useState("");
  useEffect(() => {
    if (!eligibleTechs.some((t) => t.id === techId)) {
      setTechId(eligibleTechs[0]?.id ?? "");
    }
  }, [eligibleTechs, techId]);
  const selected = eligibleTechs.find((t) => t.id === techId);

  useActionToast(state, {
    success: { title: "Assignment created" },
    error: { fallbackTitle: "Failed to create assignment" },
  });

  useEffect(() => {
    if (state && state.ok) onSuccess?.();
  }, [state, onSuccess]);

  const fieldErrors = state && state.ok === false ? state.fieldErrors : undefined;
  const formError = state && state.ok === false ? state.formError : undefined;

  if (technicians.length === 0) {
    return (
      <p className="text-sm text-fg-muted">
        No technicians exist yet. Create one from the Technicians page, then come back to assign.
      </p>
    );
  }

  return (
    <form action={action} className="flex flex-col gap-4">
      <input type="hidden" name="clientAccountId" value={clientAccountId} />
      <FormError error={formError} />

      <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
        <div className="md:col-span-2">
          <SelectField
            label="Technician"
            name="technicianId"
            required
            value={techId}
            onChange={(e) => setTechId(e.target.value)}
            errors={fieldErrors?.technicianId}
            hint={
              eligibleTechs.length === 0
                ? `No technicians flagged for ${categoryLabel[category]} (or all are dedicated)`
                : selected
                  ? `Band ${selected.band}`
                  : undefined
            }
          >
            {eligibleTechs.length === 0 ? (
              <option value="" disabled>
                — none available for {categoryLabel[category]} —
              </option>
            ) : (
              eligibleTechs.map((t) => (
                <option key={t.id} value={t.id}>
                  {formatTechDisplay(displayMap.get(t.id), `${t.firstName} ${t.lastName}`)}
                </option>
              ))
            )}
          </SelectField>
        </div>
        <SelectField
          label="Category"
          name="rateCategory"
          required
          value={category}
          onChange={(e) => setCategory(e.target.value as RateCategory)}
          errors={fieldErrors?.rateCategory}
          hint="Filters the technician list to this pool"
        >
          {Object.values(RateCategory).map((c) => (
            <option key={c} value={c}>
              {categoryLabel[c]}
            </option>
          ))}
        </SelectField>
        <TextField
          label="Start date"
          name="startDate"
          type="date"
          required
          defaultValue={today}
          errors={fieldErrors?.startDate}
        />
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <TextField
          label="End date"
          name="endDate"
          type="date"
          errors={fieldErrors?.endDate}
          hint="Open-ended if blank (typical for DEDICATED)"
        />
        <div className="flex items-end text-xs text-fg-subtle">
          Account: <span className="ml-1 font-medium text-fg">{accountLabel}</span>
        </div>
      </div>

      <SelectField
        label="Band SLA tier"
        name="slaTier"
        defaultValue="NONE"
        errors={fieldErrors?.slaTier}
        hint="DEDICATED: BACKFILL / NO_BACKFILL picks the rate row. NONE for Dispatch / Project."
      >
        <option value="NONE">None (Dispatch / Project)</option>
        <option value="BACKFILL">Backfill (replacement guaranteed)</option>
        <option value="NO_BACKFILL">No Backfill</option>
      </SelectField>

      <SubmitButton>Create assignment</SubmitButton>
    </form>
  );
}
