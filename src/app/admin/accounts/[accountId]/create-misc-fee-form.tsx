"use client";

import { useActionState, useEffect } from "react";
import { MiscFeeKind } from "@prisma/client";
import { createMiscFee } from "@/lib/actions/misc-fee";
import { FormError, SelectField, SubmitButton, TextField } from "@/components/admin/field";

const kindLabel: Record<MiscFeeKind, string> = {
  MISCELLANEOUS_PRICES: "Miscellaneous Prices",
  RETAINER_FEES: "Retainer Fees",
  MILEAGE: "Mileage",
  BGV_COST: "BGV Cost",
  PER_DIEM: "Per Diem",
  TOOLKIT: "Toolkit",
  ACCOUNT_SPECIFIC: "Account Specific",
  OTHER: "Other",
};

export function MiscFeeCreateForm({
  clientAccountId,
  onSuccess,
}: {
  clientAccountId: string;
  onSuccess?: () => void;
}) {
  const [state, action] = useActionState(createMiscFee, null);
  const fieldErrors = state && state.ok === false ? state.fieldErrors : undefined;
  const formError = state && state.ok === false ? state.formError : undefined;

  useEffect(() => {
    if (state && state.ok) onSuccess?.();
  }, [state, onSuccess]);

  return (
    <form action={action} className="grid grid-cols-2 gap-3 md:grid-cols-4">
      <input type="hidden" name="clientAccountId" value={clientAccountId} />
      <SelectField label="Kind" name="kind" required errors={fieldErrors?.kind}>
        {Object.values(MiscFeeKind).map((k) => (
          <option key={k} value={k}>
            {kindLabel[k]}
          </option>
        ))}
      </SelectField>
      <TextField label="Label" name="label" required errors={fieldErrors?.label} />
      <TextField
        label="Amount"
        name="amount"
        type="number"
        step="0.01"
        min="0"
        errors={fieldErrors?.amount}
        hint="Leave blank for to-be-determined"
      />
      <TextField label="Notes" name="notes" errors={fieldErrors?.notes} />
      <div className="col-span-2 flex items-center gap-3 md:col-span-4">
        <SubmitButton>Add misc fee</SubmitButton>
        <FormError error={formError} />
        {state && state.ok && <span className="text-sm text-green-700">Added.</span>}
      </div>
    </form>
  );
}
