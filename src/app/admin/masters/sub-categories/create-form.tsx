"use client";

import { useActionState, useEffect } from "react";
import { RateCategory } from "@prisma/client";
import { createRateSubCategory } from "@/lib/actions/rate-sub-category";
import { FormError, SelectField, SubmitButton, TextField } from "@/components/admin/field";

const categoryLabel: Record<RateCategory, string> = {
  DEDICATED: "Dedicated",
  PROJECT_TM: "Project / T&M",
  DISPATCH_SCHED: "Dispatch + Scheduled Visit",
};

export function SubCategoryCreateForm({ onSuccess }: { onSuccess?: () => void } = {}) {
  const [state, action] = useActionState(createRateSubCategory, null);
  const fieldErrors = state && state.ok === false ? state.fieldErrors : undefined;
  const formError = state && state.ok === false ? state.formError : undefined;

  useEffect(() => {
    if (state && state.ok) onSuccess?.();
  }, [state, onSuccess]);

  return (
    <form action={action} className="grid grid-cols-1 gap-3 md:grid-cols-5">
      <FormError error={formError} />
      <SelectField
        label="Rate category"
        name="rateCategory"
        required
        errors={fieldErrors?.rateCategory}
      >
        {Object.values(RateCategory).map((c) => (
          <option key={c} value={c}>
            {categoryLabel[c]}
          </option>
        ))}
      </SelectField>
      <TextField
        label="Code"
        name="code"
        required
        placeholder="HOURLY_BACKFILL"
        errors={fieldErrors?.code}
        hint="Uppercase, underscore."
      />
      <TextField
        label="Label"
        name="label"
        required
        placeholder="Hourly backfill"
        errors={fieldErrors?.label}
      />
      <TextField
        label="Sort order"
        name="sortOrder"
        type="number"
        defaultValue={0}
        min={0}
        errors={fieldErrors?.sortOrder}
      />
      <label className="flex flex-col gap-1.5 self-end">
        <span className="text-xs font-medium text-fg-muted">OT variant?</span>
        <label className="glass-input inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm">
          <input
            type="checkbox"
            name="isOvertimeVariant"
            className="h-4 w-4 rounded border-border-strong text-accent accent-accent focus:ring-accent"
          />
          <span className="text-fg-muted">Group with base sub-cat</span>
        </label>
      </label>
      <div className="md:col-span-5">
        <SubmitButton>Add sub-category</SubmitButton>
        {state && state.ok && !onSuccess && <span className="ml-3 text-sm text-success">Added.</span>}
      </div>
    </form>
  );
}
