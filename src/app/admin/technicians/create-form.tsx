"use client";

import { useActionState, useEffect, useState } from "react";
import { RateCategory } from "@prisma/client";
import { createTechnician } from "@/lib/actions/technician";
import { FormError, SelectField, SubmitButton, TextField } from "@/components/admin/field";

const categoryLabel: Record<RateCategory, string> = {
  DEDICATED: "Dedicated",
  PROJECT_TM: "Project / T&M",
  DISPATCH_SCHED: "Dispatch + Scheduled Visit",
};

export type AccountOption = { id: string; label: string };

export function TechnicianCreateForm({
  orgs,
  accounts = [],
  onSuccess,
}: {
  orgs: { id: string; name: string }[];
  accounts?: AccountOption[];
  onSuccess?: () => void;
}) {
  const [state, action] = useActionState(createTechnician, null);
  const [assignNow, setAssignNow] = useState(false);
  const [primaryCategory, setPrimaryCategory] = useState<RateCategory>(RateCategory.DEDICATED);

  const fieldErrors = state && state.ok === false ? state.fieldErrors : undefined;
  const formError = state && state.ok === false ? state.formError : undefined;
  const today = new Date().toISOString().slice(0, 10);

  useEffect(() => {
    if (state && state.ok) onSuccess?.();
  }, [state, onSuccess]);

  return (
    <form action={action} className="flex flex-col gap-5">
      <FormError error={formError} />

      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <TextField label="First name" name="firstName" required errors={fieldErrors?.firstName} />
        <TextField label="Last name" name="lastName" required errors={fieldErrors?.lastName} />
        <SelectField
          label="Employer org"
          name="employerOrgId"
          required
          errors={fieldErrors?.employerOrgId}
          hint="Org that employs this technician."
        >
          {orgs.map((o) => (
            <option key={o.id} value={o.id}>
              {o.name}
            </option>
          ))}
        </SelectField>
        <SelectField
          label="Primary category"
          name="primaryCategory"
          required
          value={primaryCategory}
          onChange={(e) => setPrimaryCategory(e.target.value as RateCategory)}
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
        <div />
      </div>

      <div className="glass-soft rounded-md p-4">
        <label className="flex cursor-pointer items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={assignNow}
            onChange={(e) => setAssignNow(e.target.checked)}
            disabled={accounts.length === 0}
            className="h-4 w-4 rounded border-border-strong text-accent accent-accent focus:ring-accent"
          />
          <span className="font-medium text-fg">Assign to an account immediately</span>
          {accounts.length === 0 && (
            <span className="text-xs text-fg-subtle">(no accounts available)</span>
          )}
        </label>
        <p className="mt-1 pl-6 text-xs text-fg-subtle">
          Creates the technician and an active assignment in one step. Rates are inherited from
          the chosen account at the picked category and the tech&rsquo;s band.
        </p>

        {assignNow && (
          <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-3">
            <SelectField
              label="Account"
              name="initialAccountId"
              required={assignNow}
              errors={fieldErrors?.initialAccountId}
            >
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.label}
                </option>
              ))}
            </SelectField>
            <SelectField
              label="Assignment category"
              name="initialCategory"
              defaultValue={primaryCategory}
              errors={fieldErrors?.initialCategory}
              hint="Defaults to primary category; override if this engagement differs."
            >
              {Object.values(RateCategory).map((c) => (
                <option key={c} value={c}>
                  {categoryLabel[c]}
                </option>
              ))}
            </SelectField>
            <TextField
              label="Start date"
              name="initialStartDate"
              type="date"
              required={assignNow}
              defaultValue={today}
              errors={fieldErrors?.initialStartDate}
            />
          </div>
        )}
      </div>

      <div>
        <SubmitButton>{assignNow ? "Create + assign" : "Add technician"}</SubmitButton>
        {state && state.ok && !onSuccess && <span className="ml-3 text-sm text-success">Added.</span>}
      </div>
    </form>
  );
}
