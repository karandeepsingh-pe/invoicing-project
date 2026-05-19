"use client";

import { useActionState } from "react";
import { TechType } from "@prisma/client";
import { createTechnician } from "@/lib/actions/technician";
import { FormError, SelectField, SubmitButton, TextField } from "@/components/admin/field";

export function TechnicianCreateForm({ orgs }: { orgs: { id: string; name: string }[] }) {
  const [state, action] = useActionState(createTechnician, null);
  const fieldErrors = state && state.ok === false ? state.fieldErrors : undefined;
  const formError = state && state.ok === false ? state.formError : undefined;

  return (
    <form action={action} className="grid grid-cols-1 gap-3 md:grid-cols-3">
      <FormError error={formError} />
      <TextField label="Full name" name="name" required errors={fieldErrors?.name} />
      <SelectField
        label="Primary type"
        name="primaryType"
        required
        errors={fieldErrors?.primaryType}
      >
        {Object.values(TechType).map((t) => (
          <option key={t} value={t}>
            {t}
          </option>
        ))}
      </SelectField>
      <SelectField
        label="Employer org"
        name="employerOrgId"
        required
        errors={fieldErrors?.employerOrgId}
        hint="Org that employs this technician (usually Ovation; sometimes a subcontractor)."
      >
        {orgs.map((o) => (
          <option key={o.id} value={o.id}>
            {o.name}
          </option>
        ))}
      </SelectField>
      <div className="md:col-span-3">
        <SubmitButton>Add technician</SubmitButton>
        {state && state.ok && <span className="ml-3 text-sm text-green-700">Added.</span>}
      </div>
    </form>
  );
}
