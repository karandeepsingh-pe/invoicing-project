"use client";

import { useActionState, useState } from "react";
import { OutputTemplate, RateBasis } from "@prisma/client";
import { updateOrg } from "@/lib/actions/org";
import { FormError, SelectField, SubmitButton, TextField } from "@/components/admin/field";

export function OrgEditForm({
  id,
  name,
  outputTemplate,
  defaultCurrency,
  backfillAllowed,
  rateBasis,
}: {
  id: string;
  name: string;
  outputTemplate: OutputTemplate;
  defaultCurrency: string;
  backfillAllowed: boolean;
  rateBasis: RateBasis;
}) {
  const [state, action] = useActionState(updateOrg, null);
  const [open, setOpen] = useState(false);

  const fieldErrors = state && state.ok === false ? state.fieldErrors : undefined;
  const formError = state && state.ok === false ? state.formError : undefined;

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center rounded-md border border-border-strong bg-surface px-2 py-1 text-xs font-medium text-fg-muted transition-colors hover:bg-surface-2 hover:text-fg"
      >
        Edit org
      </button>
    );
  }

  return (
    <form action={action} className="glass-soft flex flex-col gap-2 rounded-md p-3">
      <div className="flex items-baseline justify-between">
        <span className="text-xs font-semibold tracking-tightish">Edit org</span>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-xs font-medium text-fg-subtle hover:text-fg"
        >
          Cancel
        </button>
      </div>
      <input type="hidden" name="id" value={id} />
      <FormError error={formError} />
      <TextField label="Name" name="name" defaultValue={name} required errors={fieldErrors?.name} />
      <SelectField
        label="Output template"
        name="outputTemplate"
        defaultValue={outputTemplate}
        errors={fieldErrors?.outputTemplate}
        hint="FSO is for HCL; PRE_INVOICE for everyone else."
      >
        <option value={OutputTemplate.PRE_INVOICE}>PRE_INVOICE</option>
        <option value={OutputTemplate.FSO}>FSO</option>
      </SelectField>
      <TextField
        label="Default currency"
        name="defaultCurrency"
        defaultValue={defaultCurrency}
        maxLength={3}
        errors={fieldErrors?.defaultCurrency}
      />
      <SelectField
        label="Backfill policy"
        name="backfillAllowed"
        defaultValue={backfillAllowed ? "true" : "false"}
        hint="Gates the BACKFILL tier and coverage events. Accounts can override."
      >
        <option value="true">Allowed</option>
        <option value="false">Not allowed</option>
      </SelectField>
      <SelectField
        label="Dedicated rate basis"
        name="rateBasis"
        defaultValue={rateBasis}
        hint="Dedicated FTEs only. Annual divides the annual figure by 260 for a day rate. Dispatch and Project bill from their own hourly-based rates. Accounts can override."
      >
        <option value={RateBasis.DAY_RATE}>Day rate</option>
        <option value={RateBasis.ANNUAL}>Annual</option>
      </SelectField>
      <div className="flex items-center gap-2">
        <SubmitButton>Save</SubmitButton>
        {state && state.ok && <span className="text-xs text-success">Saved.</span>}
      </div>
    </form>
  );
}
