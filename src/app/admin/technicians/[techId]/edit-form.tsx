"use client";

import { useActionState, useState } from "react";
import { RateCategory } from "@prisma/client";
import { updateTechnician } from "@/lib/actions/technician";
import { FormError, SelectField, SubmitButton, TextField } from "@/components/admin/field";

const categoryLabel: Record<RateCategory, string> = {
  DEDICATED: "Dedicated",
  PROJECT_TM: "Project / T&M",
  DISPATCH_SCHED: "Dispatch + Scheduled Visit",
};

export type TechEditFormProps = {
  id: string;
  firstName: string;
  lastName: string;
  primaryCategory: RateCategory;
  band: number;
  active: boolean;
  employerOrgId: string;
  orgs: { id: string; name: string }[];
};

export function TechnicianEditForm(props: TechEditFormProps) {
  const [state, action] = useActionState(updateTechnician, null);
  const [open, setOpen] = useState(false);

  const fieldErrors = state && state.ok === false ? state.fieldErrors : undefined;
  const formError = state && state.ok === false ? state.formError : undefined;

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center rounded-md border border-border-strong bg-surface px-3 py-1.5 text-xs font-medium text-fg-muted transition-colors hover:bg-surface-2 hover:text-fg"
      >
        Edit details
      </button>
    );
  }

  return (
    <form action={action} className="glass flex flex-col gap-4 rounded-lg p-5">
      <div className="flex items-baseline justify-between">
        <h2 className="text-base font-semibold tracking-tightish">Edit technician</h2>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="text-xs font-medium text-fg-subtle hover:text-fg"
        >
          Cancel
        </button>
      </div>

      <input type="hidden" name="id" value={props.id} />
      <FormError error={formError} />

      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <TextField
          label="First name"
          name="firstName"
          required
          defaultValue={props.firstName}
          errors={fieldErrors?.firstName}
        />
        <TextField
          label="Last name"
          name="lastName"
          required
          defaultValue={props.lastName}
          errors={fieldErrors?.lastName}
        />
        <SelectField
          label="Employer org"
          name="employerOrgId"
          required
          defaultValue={props.employerOrgId}
          errors={fieldErrors?.employerOrgId}
          hint="Changing this does not affect historical assignments."
        >
          {props.orgs.map((o) => (
            <option key={o.id} value={o.id}>
              {o.name}
            </option>
          ))}
        </SelectField>
        <SelectField
          label="Primary category"
          name="primaryCategory"
          required
          defaultValue={props.primaryCategory}
          errors={fieldErrors?.primaryCategory}
          hint="Default category when creating new assignments."
        >
          {Object.values(RateCategory).map((c) => (
            <option key={c} value={c}>
              {categoryLabel[c]}
            </option>
          ))}
        </SelectField>
        <SelectField
          label="Band"
          name="band"
          required
          defaultValue={String(props.band)}
          errors={fieldErrors?.band}
          hint="Existing assignments inherit rates per band — changing this affects future rate look-ups."
        >
          {[0, 1, 2, 3, 4].map((b) => (
            <option key={b} value={b}>
              Band {b}
            </option>
          ))}
        </SelectField>
        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-fg-muted">Active</span>
          <label className="inline-flex items-center gap-2 rounded-md border border-border-strong bg-surface px-3 py-2 text-sm">
            <input
              type="checkbox"
              name="active"
              defaultChecked={props.active}
              className="h-4 w-4 rounded border-border-strong text-accent accent-accent focus:ring-accent"
            />
            <span className="text-fg-muted">Tech is active</span>
          </label>
          <span className="text-xs text-fg-subtle">Inactive techs are hidden from default lists.</span>
        </label>
      </div>

      <div className="flex items-center gap-3">
        <SubmitButton>Save changes</SubmitButton>
        {state && state.ok && <span className="text-sm text-success">Saved.</span>}
      </div>
    </form>
  );
}
