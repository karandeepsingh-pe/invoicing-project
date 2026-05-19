"use client";

import { useActionState } from "react";
import { RateUnit, TechType } from "@prisma/client";
import { createRateCard } from "@/lib/actions/rate-card";
import { FormError, SelectField, SubmitButton, TextField } from "@/components/admin/field";

export function RateCardCreateForm({ clientAccountId }: { clientAccountId: string }) {
  const [state, action] = useActionState(createRateCard, null);
  const fieldErrors = state && state.ok === false ? state.fieldErrors : undefined;
  const formError = state && state.ok === false ? state.formError : undefined;

  return (
    <form action={action} className="grid grid-cols-2 gap-3 md:grid-cols-4">
      <input type="hidden" name="clientAccountId" value={clientAccountId} />
      <SelectField label="Tech type" name="techType" required errors={fieldErrors?.techType}>
        {Object.values(TechType).map((t) => (
          <option key={t} value={t}>
            {t}
          </option>
        ))}
      </SelectField>
      <SelectField label="Rate unit" name="rateUnit" required errors={fieldErrors?.rateUnit}>
        {Object.values(RateUnit).map((u) => (
          <option key={u} value={u}>
            {u}
          </option>
        ))}
      </SelectField>
      <TextField
        label="Rate amount"
        name="rateAmount"
        type="number"
        step="0.01"
        min="0.01"
        required
        errors={fieldErrors?.rateAmount}
      />
      <TextField
        label="OT rate"
        name="otRate"
        type="number"
        step="0.01"
        min="0"
        errors={fieldErrors?.otRate}
        hint="Optional"
      />
      <TextField
        label="Effective from"
        name="effectiveFrom"
        type="date"
        required
        errors={fieldErrors?.effectiveFrom}
      />
      <TextField
        label="Effective to"
        name="effectiveTo"
        type="date"
        errors={fieldErrors?.effectiveTo}
        hint="Leave blank for open-ended"
      />
      <div className="col-span-2 md:col-span-4 flex items-center gap-3">
        <SubmitButton>Add rate card</SubmitButton>
        <FormError error={formError} />
        {state && state.ok && <span className="text-sm text-green-700">Rate card added.</span>}
      </div>
    </form>
  );
}
