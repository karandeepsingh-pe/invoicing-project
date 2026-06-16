"use client";

import { useActionState, useState } from "react";
import { AssignmentSlaTier, RateCategory } from "@prisma/client";
import { updateTechnician } from "@/lib/actions/technician";
import { FormError, SelectField, SubmitButton, TextField } from "@/components/admin/field";
import { LocationFields } from "@/components/admin/location-fields";
import { AvailabilityFlagsField } from "@/components/admin/availability-flags-field";
import { RebadgedFields } from "@/components/admin/rebadged-fields";

const categoryLabel: Record<RateCategory, string> = {
  DEDICATED: "Dedicated",
  PROJECT_TM: "Project / T&M",
  DISPATCH_SCHED: "Dispatch",
  SCHEDULED: "Scheduled Visit",
};

export type TechEditFormProps = {
  id: string;
  firstName: string;
  lastName: string;
  employeeId: string | null;
  phone: string | null;
  email: string | null;
  primaryCategory: RateCategory;
  band: number;
  defaultSlaTier: AssignmentSlaTier;
  dedicatedBillingBasis: string;
  active: boolean;
  isAvailableForDedicated: boolean;
  isAvailableForProject: boolean;
  isAvailableForDispatch: boolean;
  isRebadged: boolean;
  annualSalary: string | null;
  rebadgedHourlyRate: string | null;
  rebadgedDayRate: string | null;
  rebadgedMonthlyRate: string | null;
  rebadgedOtRate: string | null;
  rebadgedWeekendRate: string | null;
  employerOrgId: string;
  orgs: { id: string; name: string }[];
  postalCodeId: string | null;
  addressLine1: string | null;
  startDate: string | null;
  zipcode: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
};

export function TechnicianEditForm(props: TechEditFormProps) {
  const [state, action] = useActionState(updateTechnician, null);
  const [open, setOpen] = useState(false);
  const [primaryCategory, setPrimaryCategory] = useState<RateCategory>(props.primaryCategory);

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
        <TextField
          label="Employee ID"
          name="employeeId"
          defaultValue={props.employeeId ?? ""}
          errors={fieldErrors?.employeeId}
          hint="Optional. Unique per employer client."
        />
        <TextField
          label="Phone"
          name="phone"
          defaultValue={props.phone ?? ""}
          errors={fieldErrors?.phone}
          hint="Contact number."
        />
        <TextField
          label="Email"
          name="email"
          type="email"
          defaultValue={props.email ?? ""}
          errors={fieldErrors?.email}
          hint="Contact email."
        />
        <SelectField
          label="Employer client"
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
          value={primaryCategory}
          onChange={(e) => setPrimaryCategory(e.target.value as RateCategory)}
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
          hint="Existing assignments keep their band's rates. Changing this only affects future lookups."
        >
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
            defaultValue={props.defaultSlaTier === "NONE" ? "" : props.defaultSlaTier}
            errors={fieldErrors?.defaultSlaTier}
            hint="Dedicated rates depend on backfill."
          >
            <option value="" disabled>
              Select…
            </option>
            <option value="BACKFILL">Backfill (replacement guaranteed)</option>
            <option value="NO_BACKFILL">No Backfill</option>
          </SelectField>
        )}
        {/* Billing-basis selector retired (2026-06-10): Dedicated bills on annual
            salary only. The stored value is ignored by billing; the column drops
            after a clean prod month. */}
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

      <AvailabilityFlagsField
        defaults={{
          isAvailableForDedicated: props.isAvailableForDedicated,
          isAvailableForProject: props.isAvailableForProject,
          isAvailableForDispatch: props.isAvailableForDispatch,
        }}
      />

      <RebadgedFields
        primaryCategory={primaryCategory}
        defaults={{
          isRebadged: props.isRebadged,
          annualSalary: props.annualSalary,
          rebadgedHourlyRate: props.rebadgedHourlyRate,
          rebadgedDayRate: props.rebadgedDayRate,
          rebadgedMonthlyRate: props.rebadgedMonthlyRate,
          rebadgedOtRate: props.rebadgedOtRate,
          rebadgedWeekendRate: props.rebadgedWeekendRate,
        }}
      />

      <TextField
        label="Start date"
        name="startDate"
        type="date"
        defaultValue={props.startDate ?? ""}
        errors={fieldErrors?.startDate}
        hint="Employment start (optional)."
      />

      <TextField
        label="Address line 1"
        name="addressLine1"
        defaultValue={props.addressLine1 ?? ""}
        errors={fieldErrors?.addressLine1}
        hint="Street address (optional)."
      />

      <LocationFields
        initialZipcode={props.zipcode ?? ""}
        initialCity={props.city ?? ""}
        initialState={props.state ?? ""}
        initialCountry={props.country ?? ""}
        initialPostalCodeId={props.postalCodeId}
        fieldErrors={{
          zipcode: fieldErrors?.zipcode,
          locationCity: fieldErrors?.locationCity,
          locationState: fieldErrors?.locationState,
          locationCountry: fieldErrors?.locationCountry,
        }}
      />

      <div className="flex items-center gap-3">
        <SubmitButton>Save changes</SubmitButton>
        {state && state.ok && <span className="text-sm text-success">Saved.</span>}
      </div>
    </form>
  );
}
