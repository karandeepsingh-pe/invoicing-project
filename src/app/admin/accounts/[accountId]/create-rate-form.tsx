"use client";

import { useActionState, useMemo, useState } from "react";
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
}: {
  clientAccountId: string;
  subCategories: SubCat[];
  slas: Sla[];
}) {
  const [state, action] = useActionState(createAccountRate, null);
  const [category, setCategory] = useState<RateCategory>(RateCategory.DEDICATED);

  const subCatsForCategory = useMemo(
    () => subCategories.filter((s) => s.rateCategory === category),
    [category, subCategories],
  );
  const today = new Date().toISOString().slice(0, 10);

  const fieldErrors = state && state.ok === false ? state.fieldErrors : undefined;
  const formError = state && state.ok === false ? state.formError : undefined;

  return (
    <form action={action} className="grid grid-cols-2 gap-3 md:grid-cols-4">
      <input type="hidden" name="clientAccountId" value={clientAccountId} />

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
        {slas.map((s) => (
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
        label="Effective from"
        name="effectiveFrom"
        type="date"
        required
        defaultValue={today}
        errors={fieldErrors?.effectiveFrom}
      />

      <TextField
        label="Effective to"
        name="effectiveTo"
        type="date"
        errors={fieldErrors?.effectiveTo}
        hint="Open-ended if blank"
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
