"use client";

import { useActionState } from "react";
import { OutputTemplate } from "@prisma/client";
import { createOrg } from "@/lib/actions/org";
import { FormError, SelectField, SubmitButton, TextField } from "@/components/admin/field";

export function OrgCreateForm() {
  const [state, action] = useActionState(createOrg, null);
  const fieldErrors = state && state.ok === false ? state.fieldErrors : undefined;
  const formError = state && state.ok === false ? state.formError : undefined;

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
      <SubmitButton>Create org</SubmitButton>
      {state && state.ok && <div className="text-sm text-green-700">Org created.</div>}
    </form>
  );
}
