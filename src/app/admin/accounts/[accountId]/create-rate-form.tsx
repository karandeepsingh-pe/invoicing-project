"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import { RateCategory } from "@prisma/client";
import { createAccountRate } from "@/lib/actions/account-rate";
import { FormError, SelectField, SubmitButton, TextField } from "@/components/admin/field";

type SubCat = { id: string; rateCategory: RateCategory; code: string; label: string };
type Sla = { id: string; code: string; label: string };

const categoryLabel: Record<RateCategory, string> = {
  DEDICATED: "Dedicated",
  PROJECT_TM: "Project / T&M",
  DISPATCH_SCHED: "Dispatch + Scheduled Visit",
};

export function AccountRateCreateForm({
  clientAccountId,
  subCategories,
  slas,
  lockedCategory,
  onSuccess,
}: {
  clientAccountId: string;
  subCategories: SubCat[];
  slas: Sla[];
  lockedCategory?: RateCategory;
  onSuccess?: () => void;
}) {
  const [state, action] = useActionState(createAccountRate, null);
  const [category, setCategory] = useState<RateCategory>(
    lockedCategory ?? RateCategory.DEDICATED,
  );

  useEffect(() => {
    if (state && state.ok) onSuccess?.();
  }, [state, onSuccess]);

  const subCatsForCategory = useMemo(
    () => subCategories.filter((s) => s.rateCategory === category),
    [category, subCategories],
  );

  // Per-category SLA filter so the dropdown only shows codes that actually
  // apply to that rate dimension.
  // DEDICATED uses Backfill tier (BACKFILL / NO_BACKFILL).
  // DISPATCH_SCHED uses response SLAs (NBD / SBD / 2BD / 3BD / 9X5X4 / 24X7X4).
  // PROJECT_TM uses SCHEDULE / NA.
  const slasForCategory = useMemo(() => {
    const dedicatedTiers = new Set(["BACKFILL", "NO_BACKFILL"]);
    const dispatchCodes = new Set([
      "NBD",
      "SBD",
      "2BD",
      "3BD",
      "9X5X4",
      "24X7X4",
      "SCHEDULE",
    ]);
    const projectCodes = new Set(["SCHEDULE", "NA"]);
    if (category === RateCategory.DEDICATED) {
      return slas.filter((s) => dedicatedTiers.has(s.code));
    }
    if (category === RateCategory.DISPATCH_SCHED) {
      return slas.filter((s) => dispatchCodes.has(s.code));
    }
    return slas.filter((s) => projectCodes.has(s.code));
  }, [category, slas]);

  const fieldErrors = state && state.ok === false ? state.fieldErrors : undefined;
  const formError = state && state.ok === false ? state.formError : undefined;

  return (
    <form action={action} className="grid grid-cols-2 gap-3 md:grid-cols-4">
      <input type="hidden" name="clientAccountId" value={clientAccountId} />

      {!lockedCategory && (
        <SelectField
          label="Category"
          name="_category"
          value={category}
          onChange={(e) => setCategory(e.target.value as RateCategory)}
        >
          {Object.values(RateCategory).map((c) => (
            <option key={c} value={c}>
              {categoryLabel[c]}
            </option>
          ))}
        </SelectField>
      )}

      <SelectField
        label="Sub-category"
        name="rateSubCategoryId"
        required
        errors={fieldErrors?.rateSubCategoryId}
      >
        {subCatsForCategory.map((s) => (
          <option key={s.id} value={s.id}>
            {s.label}
          </option>
        ))}
      </SelectField>

      <SelectField label="Band" name="band" required defaultValue="2" errors={fieldErrors?.band}>
        {[0, 1, 2, 3, 4].map((b) => (
          <option key={b} value={b}>
            Band {b}
          </option>
        ))}
      </SelectField>

      <SelectField label="SLA" name="slaId" required errors={fieldErrors?.slaId}>
        {slasForCategory.map((s) => (
          <option key={s.id} value={s.id}>
            {s.code} — {s.label}
          </option>
        ))}
      </SelectField>

      <TextField
        label="Rate amount"
        name="rateAmount"
        type="number"
        step="0.0001"
        min="0"
        errors={fieldErrors?.rateAmount}
        hint="Leave blank to fill in later"
      />

      <TextField
        label="Notes"
        name="notes"
        type="text"
        maxLength={500}
        errors={fieldErrors?.notes}
      />

      <div className="col-span-2 flex items-center gap-3 md:col-span-4">
        <SubmitButton>Add rate row</SubmitButton>
        <FormError error={formError} />
        {state && state.ok && <span className="text-sm text-green-700">Added.</span>}
      </div>
    </form>
  );
}
