"use client";

import { useActionState, useState } from "react";
import { OutputTemplate } from "@prisma/client";
import { updateOrg } from "@/lib/actions/org";
import {
  FormError,
  SelectField,
  SubmitButton,
  TextAreaField,
  TextField,
} from "@/components/admin/field";

export function OrgEditForm({
  id,
  name,
  outputTemplate,
  defaultCurrency,
  remitClientCode,
  remitClientName,
  remitClientAddress,
}: {
  id: string;
  name: string;
  outputTemplate: OutputTemplate;
  defaultCurrency: string;
  remitClientCode: string | null;
  remitClientName: string | null;
  remitClientAddress: string | null;
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
      <fieldset className="flex flex-col gap-2 border-t border-border pt-2">
        <legend className="text-xs font-semibold tracking-tightish text-fg-muted">
          Remittance bill-to (optional)
        </legend>
        <TextField
          label="Client code"
          name="remitClientCode"
          defaultValue={remitClientCode ?? ""}
          placeholder="A009"
          errors={fieldErrors?.remitClientCode}
        />
        <TextField
          label="Client name"
          name="remitClientName"
          defaultValue={remitClientName ?? ""}
          placeholder="HCL America Inc."
          errors={fieldErrors?.remitClientName}
        />
        <TextAreaField
          label="Client address"
          name="remitClientAddress"
          defaultValue={remitClientAddress ?? ""}
          rows={3}
          placeholder={"2600 Great America Way\nSanta Clara, CA 95054, United States"}
          hint="One line per row. Shown under 'Client Details:' on every account's Remittance Advice."
          errors={fieldErrors?.remitClientAddress}
        />
      </fieldset>
      <div className="flex items-center gap-2">
        <SubmitButton>Save</SubmitButton>
        {state && state.ok && <span className="text-xs text-success">Saved.</span>}
      </div>
    </form>
  );
}
