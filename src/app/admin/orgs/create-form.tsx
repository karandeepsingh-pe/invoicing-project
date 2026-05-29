"use client";

import { useActionState, useEffect } from "react";
import { OutputTemplate, RateBasis } from "@prisma/client";
import { createOrg } from "@/lib/actions/org";
import { FormError, SelectField, SubmitButton, TextField } from "@/components/admin/field";
import { useActionToast } from "@/lib/hooks/use-action-toast";

export function OrgCreateForm({ onSuccess }: { onSuccess?: () => void } = {}) {
  const [state, action] = useActionState(createOrg, null);
  const fieldErrors = state && state.ok === false ? state.fieldErrors : undefined;
  const formError = state && state.ok === false ? state.formError : undefined;

  useActionToast(state, {
    success: { title: "Org created" },
    error: { fallbackTitle: "Failed to create org" },
  });

  useEffect(() => {
    if (state && state.ok) onSuccess?.();
  }, [state, onSuccess]);

  return (
    <form action={action} className="flex flex-col gap-3">
      <FormError error={formError} />
      <TextField label="Name" name="name" required errors={fieldErrors?.name} />
      <SelectField
        label="Output template"
        name="outputTemplate"
        required
        defaultValue={OutputTemplate.PRE_INVOICE}
        errors={fieldErrors?.outputTemplate}
        hint="FSO is for HCL; PRE_INVOICE for everyone else."
      >
        <option value={OutputTemplate.PRE_INVOICE}>PRE_INVOICE</option>
        <option value={OutputTemplate.FSO}>FSO</option>
      </SelectField>
      <TextField
        label="Default currency"
        name="defaultCurrency"
        defaultValue="USD"
        maxLength={3}
        errors={fieldErrors?.defaultCurrency}
      />
      <SelectField
        label="Backfill policy"
        name="backfillAllowed"
        defaultValue="true"
        hint="Gates the BACKFILL rate tier and coverage events for accounts under this org. Accounts can override."
      >
        <option value="true">Allowed</option>
        <option value="false">Not allowed</option>
      </SelectField>
      <SelectField
        label="Dedicated rate basis"
        name="rateBasis"
        defaultValue={RateBasis.DAY_RATE}
        hint="Dedicated FTEs only. Day rate: hourly x working hours. Annual: annual figure / 260 per day. Dispatch and Project always bill from their own hourly-based rates. Accounts can override."
      >
        <option value={RateBasis.DAY_RATE}>Day rate</option>
        <option value={RateBasis.ANNUAL}>Annual</option>
      </SelectField>
      <SubmitButton>Create org</SubmitButton>
      {state && state.ok && !onSuccess && <div className="text-sm text-success">Org created.</div>}
    </form>
  );
}
