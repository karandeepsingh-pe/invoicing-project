"use client";

import { useActionState, useState } from "react";
import { updateClientAccount } from "@/lib/actions/client-account";
import { FormError, SelectField, SubmitButton, TextField } from "@/components/admin/field";

export function ClientAccountEditForm({
  id,
  name,
  currency,
  orgDefaultCurrency,
  clientPocName,
  clientSpocEmail,
  projectDescription,
  defaultHours,
  addressLine1,
  city,
  state: stateValue,
  postalCode,
  country,
  dispatchPricingModel,
  businessHoursStart,
  businessHoursEnd,
}: {
  id: string;
  name: string;
  currency: string | null;
  orgDefaultCurrency: string;
  clientPocName: string | null;
  clientSpocEmail: string | null;
  projectDescription: string | null;
  defaultHours: number;
  addressLine1: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
  country: string | null;
  dispatchPricingModel: string;
  businessHoursStart: string | null;
  businessHoursEnd: string | null;
}) {
  const [state, action] = useActionState(updateClientAccount, null);
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
        Edit
      </button>
    );
  }

  return (
    <form
      action={action}
      className="glass-soft flex flex-col gap-2 rounded-md p-3"
    >
      <div className="flex items-baseline justify-between">
        <span className="text-xs font-semibold tracking-tightish">Edit account</span>
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
      <TextField
        label="Currency override"
        name="currency"
        maxLength={3}
        defaultValue={currency ?? ""}
        placeholder={orgDefaultCurrency}
        hint={`Leave blank to inherit org default (${orgDefaultCurrency}).`}
        errors={fieldErrors?.currency}
      />
      <TextField
        label="Client POC name"
        name="clientPocName"
        defaultValue={clientPocName ?? ""}
        placeholder="e.g. Eeshan Chambial"
        errors={fieldErrors?.clientPocName}
      />
      <TextField
        label="Client SPOC email"
        name="clientSpocEmail"
        type="email"
        defaultValue={clientSpocEmail ?? ""}
        placeholder="poc@client.com"
        errors={fieldErrors?.clientSpocEmail}
      />
      <TextField
        label="Project description"
        name="projectDescription"
        defaultValue={projectDescription ?? ""}
        placeholder="FTE - Dedicated Support"
        errors={fieldErrors?.projectDescription}
      />
      <TextField
        label="Default Hours"
        name="defaultHours"
        type="number"
        min={1}
        max={24}
        defaultValue={defaultHours}
        errors={fieldErrors?.defaultHours}
        hint="Per-day full-shift hours. Drives FTE pre-fill + OT split."
      />
      <TextField
        label="Address line 1"
        name="addressLine1"
        defaultValue={addressLine1 ?? ""}
        placeholder="123 Main Street"
        errors={fieldErrors?.addressLine1}
      />
      <TextField label="City" name="city" defaultValue={city ?? ""} errors={fieldErrors?.city} />
      <TextField label="State / Region" name="state" defaultValue={stateValue ?? ""} errors={fieldErrors?.state} />
      <TextField
        label="Zip / Postal code"
        name="postalCode"
        defaultValue={postalCode ?? ""}
        errors={fieldErrors?.postalCode}
      />
      <TextField label="Country" name="country" defaultValue={country ?? ""} errors={fieldErrors?.country} />

      <div className="mt-1 border-t border-border pt-2">
        <span className="text-xs font-semibold tracking-tightish text-fg-muted">Dispatch billing</span>
      </div>
      <SelectField
        label="Dispatch pricing model"
        name="dispatchPricingModel"
        defaultValue={dispatchPricingModel}
        errors={fieldErrors?.dispatchPricingModel}
        hint="STANDARD = band + SLA hourly math. TCS = priority-keyed first-hour."
      >
        <option value="STANDARD">Standard (band + SLA)</option>
        <option value="TCS_PRIORITY">TCS priority</option>
      </SelectField>
      <div className="grid grid-cols-2 gap-2">
        <TextField
          label="Business hours start"
          name="businessHoursStart"
          type="time"
          defaultValue={businessHoursStart ?? ""}
          errors={fieldErrors?.businessHoursStart}
        />
        <TextField
          label="Business hours end"
          name="businessHoursEnd"
          type="time"
          defaultValue={businessHoursEnd ?? ""}
          errors={fieldErrors?.businessHoursEnd}
        />
      </div>
      <span className="text-xs text-fg-subtle">
        Set both to auto-split dispatch visits: weekday hours after the end time bill at after-hours
        rates; a weekend date bills the whole visit at weekend rates. Leave blank to bill each visit by
        the manual after-hours/weekend flags.
      </span>

      <div className="flex items-center gap-2">
        <SubmitButton>Save</SubmitButton>
        {state && state.ok && <span className="text-xs text-success">Saved.</span>}
      </div>
    </form>
  );
}
