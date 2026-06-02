"use client";

import { useActionState, useEffect, useState } from "react";
import { createClientAccount } from "@/lib/actions/client-account";
import { FormError, SelectField, SubmitButton, TextField } from "@/components/admin/field";
import { useActionToast } from "@/lib/hooks/use-action-toast";

export function ClientAccountCreateAnywhereForm({
  orgs,
  onSuccess,
}: {
  orgs: { id: string; name: string; defaultCurrency: string }[];
  onSuccess?: () => void;
}) {
  const [state, action] = useActionState(createClientAccount, null);
  const [orgId, setOrgId] = useState(orgs[0]?.id ?? "");

  const selectedOrg = orgs.find((o) => o.id === orgId);
  const fieldErrors = state && state.ok === false ? state.fieldErrors : undefined;
  const formError = state && state.ok === false ? state.formError : undefined;

  useActionToast(state, {
    success: { title: "Account created" },
    error: { fallbackTitle: "Failed to create account" },
  });

  useEffect(() => {
    if (state && state.ok) onSuccess?.();
  }, [state, onSuccess]);

  if (orgs.length === 0) {
    return (
      <p className="text-sm text-fg-muted">
        Create an org first so the account has a parent.
      </p>
    );
  }

  return (
    <form action={action} className="grid grid-cols-1 gap-3 md:grid-cols-3">
      <FormError error={formError} />
      <SelectField
        label="Org"
        name="orgId"
        value={orgId}
        onChange={(e) => setOrgId(e.target.value)}
        required
        errors={fieldErrors?.orgId}
      >
        {orgs.map((o) => (
          <option key={o.id} value={o.id}>
            {o.name}
          </option>
        ))}
      </SelectField>
      <TextField label="Account name" name="name" required errors={fieldErrors?.name} />
      <TextField
        label="Currency override"
        name="currency"
        maxLength={3}
        placeholder={selectedOrg?.defaultCurrency ?? ""}
        hint={`Blank inherits org default${selectedOrg ? ` (${selectedOrg.defaultCurrency})` : ""}.`}
        errors={fieldErrors?.currency}
      />
      <TextField
        label="Client POC name"
        name="clientPocName"
        placeholder="e.g. Eeshan Chambial"
        errors={fieldErrors?.clientPocName}
      />
      <TextField
        label="Client SPOC email"
        name="clientSpocEmail"
        type="email"
        placeholder="poc@client.com"
        errors={fieldErrors?.clientSpocEmail}
      />
      <TextField
        label="Project description"
        name="projectDescription"
        placeholder="FTE - Dedicated Support"
        errors={fieldErrors?.projectDescription}
      />
      <TextField
        label="Default Hours"
        name="defaultHours"
        type="number"
        min={1}
        max={24}
        defaultValue={8}
        errors={fieldErrors?.defaultHours}
        hint="Per-day full-shift hours."
      />
      <TextField
        label="Address line 1"
        name="addressLine1"
        placeholder="123 Main Street"
        errors={fieldErrors?.addressLine1}
      />
      <TextField label="City" name="city" errors={fieldErrors?.city} />
      <TextField label="State / Region" name="state" errors={fieldErrors?.state} />
      <TextField label="Zip / Postal code" name="postalCode" errors={fieldErrors?.postalCode} />
      <TextField label="Country" name="country" errors={fieldErrors?.country} />
      <div className="md:col-span-3">
        <SubmitButton>Create account</SubmitButton>
        {state && state.ok && !onSuccess && <span className="ml-3 text-sm text-success">Created.</span>}
      </div>
    </form>
  );
}
