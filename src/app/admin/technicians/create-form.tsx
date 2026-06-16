"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import { RateCategory } from "@prisma/client";
import { createTechnician } from "@/lib/actions/technician";
import { FormError, SelectField, SubmitButton, TextField } from "@/components/admin/field";
import { LocationFields } from "@/components/admin/location-fields";
import { AvailabilityFlagsField } from "@/components/admin/availability-flags-field";
import { RebadgedFields } from "@/components/admin/rebadged-fields";
import { useActionToast } from "@/lib/hooks/use-action-toast";

const categoryLabel: Record<RateCategory, string> = {
  DEDICATED: "Dedicated",
  PROJECT_TM: "Project / T&M",
  DISPATCH_SCHED: "Dispatch",
  SCHEDULED: "Scheduled Visit",
};

export type AccountOption = { id: string; label: string };

export type ExistingTech = {
  firstName: string;
  lastName: string;
  employerOrgId: string;
  employerOrgName: string;
  employeeId: string | null;
};

function normalizeName(first: string, last: string): string {
  return `${first.trim().toLowerCase()} ${last.trim().toLowerCase()}`;
}

export function TechnicianCreateForm({
  orgs,
  existingTechs = [],
  onSuccess,
  accountContext,
  defaultEmployerOrgId,
}: {
  orgs: { id: string; name: string }[];
  accounts?: AccountOption[];
  existingTechs?: ExistingTech[];
  onSuccess?: () => void;
  /** When set, the form hides the account picker and auto-assigns the new tech
   *  to this account as Dedicated on creation. */
  accountContext?: { id: string; name: string };
  defaultEmployerOrgId?: string;
}) {
  const [state, action] = useActionState(createTechnician, null);
  const [primaryCategory, setPrimaryCategory] = useState<RateCategory>(RateCategory.DEDICATED);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");

  const fieldErrors = state && state.ok === false ? state.fieldErrors : undefined;
  const formError = state && state.ok === false ? state.formError : undefined;
  const today = new Date().toISOString().slice(0, 10);

  useActionToast(state, {
    success: { title: "Technician added" },
    error: { fallbackTitle: "Failed to add technician" },
  });

  useEffect(() => {
    if (state && state.ok) onSuccess?.();
  }, [state, onSuccess]);

  const nameMatches = useMemo<ExistingTech[]>(() => {
    if (firstName.trim().length === 0 || lastName.trim().length === 0) return [];
    const key = normalizeName(firstName, lastName);
    return existingTechs.filter((t) => normalizeName(t.firstName, t.lastName) === key);
  }, [firstName, lastName, existingTechs]);

  return (
    <form action={action} className="flex flex-col gap-5">
      <FormError error={formError} />

      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <TextField
          label="First name"
          name="firstName"
          required
          value={firstName}
          onChange={(e) => setFirstName(e.target.value)}
          errors={fieldErrors?.firstName}
        />
        <TextField
          label="Last name"
          name="lastName"
          required
          value={lastName}
          onChange={(e) => setLastName(e.target.value)}
          errors={fieldErrors?.lastName}
        />
        <TextField
          label="Employee ID"
          name="employeeId"
          errors={fieldErrors?.employeeId}
          hint="Optional. Must be unique within the employer client."
        />
        <TextField
          label="Phone"
          name="phone"
          errors={fieldErrors?.phone}
          hint="Contact number (shown on dispatch + grid)."
        />
        <TextField
          label="Email"
          name="email"
          type="email"
          errors={fieldErrors?.email}
          hint="Contact email (shown on dispatch tracker)."
        />
        <SelectField
          label="Employer client"
          name="employerOrgId"
          required
          defaultValue={defaultEmployerOrgId}
          errors={fieldErrors?.employerOrgId}
          hint="Client that employs this technician."
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
        {primaryCategory === RateCategory.DEDICATED && (
          <SelectField
            label="Backfill tier"
            name="defaultSlaTier"
            required
            defaultValue=""
            errors={fieldErrors?.defaultSlaTier}
            hint="Dedicated rates differ with vs without backfill — pick one."
          >
            <option value="" disabled>
              Select…
            </option>
            <option value="BACKFILL">Backfill (replacement guaranteed)</option>
            <option value="NO_BACKFILL">No Backfill</option>
          </SelectField>
        )}
        {/* Billing-basis selector retired (2026-06-10): Dedicated bills on annual
            salary only — annual ÷ 12 ÷ business days × days worked. */}
      </div>

      <AvailabilityFlagsField />

      <RebadgedFields primaryCategory={primaryCategory} />

      <TextField
        label="Start date"
        name="startDate"
        type="date"
        errors={fieldErrors?.startDate}
        hint="Employment start (optional). Prefills the start date when you assign this technician."
      />

      <TextField
        label="Address line 1"
        name="addressLine1"
        errors={fieldErrors?.addressLine1}
        hint="Street address (optional)."
      />

      <LocationFields
        fieldErrors={{
          zipcode: fieldErrors?.zipcode,
          locationCity: fieldErrors?.locationCity,
          locationState: fieldErrors?.locationState,
          locationCountry: fieldErrors?.locationCountry,
        }}
      />

      {nameMatches.length > 0 && (
        <div className="rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-xs text-warning">
          <p className="font-semibold">
            {nameMatches.length} existing technician
            {nameMatches.length === 1 ? "" : "s"} share this name:
          </p>
          <ul className="mt-1 list-disc pl-5">
            {nameMatches.map((t, i) => (
              <li key={i}>
                {t.firstName} {t.lastName} — {t.employerOrgName}
                {t.employeeId ? ` · #${t.employeeId}` : ""}
              </li>
            ))}
          </ul>
          <p className="mt-1">Add an Employee ID to disambiguate.</p>
        </div>
      )}

      {accountContext && (
        <div className="glass-soft rounded-md p-4">
          <p className="text-sm text-fg">
            This technician will be assigned to{" "}
            <span className="font-semibold">{accountContext.name}</span> automatically
            (Dedicated).
          </p>
          <p className="mt-1 text-xs text-fg-subtle">
            Rates inherit from this account&rsquo;s Dedicated rate rows at the tech&rsquo;s band.
            Manage or end the assignment later from the account or technician page.
          </p>
          <input type="hidden" name="initialAccountId" value={accountContext.id} />
          <input type="hidden" name="initialCategory" value={RateCategory.DEDICATED} />
          <input type="hidden" name="initialStartDate" value={today} />
        </div>
      )}

      <div>
        <SubmitButton>
          {accountContext ? "Create + assign" : "Add technician"}
        </SubmitButton>
        {state && state.ok && !onSuccess && <span className="ml-3 text-sm text-success">Added.</span>}
      </div>
    </form>
  );
}
