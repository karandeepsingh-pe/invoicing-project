"use client";

import { useActionState } from "react";
import { RateCategory } from "@prisma/client";
import { createTechnician } from "@/lib/actions/technician";
import { FormError, SelectField, SubmitButton, TextField } from "@/components/admin/field";

const categoryLabel: Record<RateCategory, string> = {
  DEDICATED: "Dedicated",
  PROJECT_TM: "Project / T&M",
  DISPATCH_SCHED: "Dispatch + Scheduled Visit",
};

export function TechnicianCreateForm({ orgs }: { orgs: { id: string; name: string }[] }) {
  const [state, action] = useActionState(createTechnician, null);
  const fieldErrors = state && state.ok === false ? state.fieldErrors : undefined;
  const formError = state && state.ok === false ? state.formError : undefined;

  return (
    <form action={action} className="grid grid-cols-1 gap-3 md:grid-cols-3">
      <FormError error={formError} />
      <TextField label="First name" name="firstName" required errors={fieldErrors?.firstName} />
      <TextField label="Last name" name="lastName" required errors={fieldErrors?.lastName} />
      <SelectField
        label="Primary category"
        name="primaryCategory"
        required
        errors={fieldErrors?.primaryCategory}
      >
        {Object.values(RateCategory).map((c) => (
          <option key={c} value={c}>
            {categoryLabel[c]}
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
      <SelectField
        label="Employer org"
        name="employerOrgId"
        required
        errors={fieldErrors?.employerOrgId}
        hint="Org that employs this technician (Ovation, or a subcontractor)."
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
