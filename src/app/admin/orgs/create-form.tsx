"use client";

import { useActionState, useEffect } from "react";
import { OutputTemplate } from "@prisma/client";
import { createOrg } from "@/lib/actions/org";
import {
  FormError,
  SelectField,
  SubmitButton,
  TextAreaField,
  TextField,
} from "@/components/admin/field";
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
      <fieldset className="mt-1 flex flex-col gap-3 border-t border-border pt-3">
        <legend className="text-xs font-semibold tracking-tightish text-fg-muted">
          Remittance bill-to (optional)
        </legend>
        <TextField
          label="Client code"
          name="remitClientCode"
          placeholder="A009"
          errors={fieldErrors?.remitClientCode}
        />
        <TextField
          label="Client name"
          name="remitClientName"
          placeholder="HCL America Inc."
          errors={fieldErrors?.remitClientName}
        />
        <TextAreaField
          label="Client address"
          name="remitClientAddress"
          rows={3}
          placeholder={"2600 Great America Way\nSanta Clara, CA 95054, United States"}
          hint="One line per row. Shown under 'Client Details:' on every account's Remittance Advice."
          errors={fieldErrors?.remitClientAddress}
        />
      </fieldset>
      <SubmitButton>Create org</SubmitButton>
      {state && state.ok && !onSuccess && <div className="text-sm text-success">Org created.</div>}
    </form>
  );
}
