"use client";

import { useActionState, useEffect, useState } from "react";
import { createClientAccount } from "@/lib/actions/client-account";
import { FormError, SelectField, SubmitButton, TextField } from "@/components/admin/field";

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
      <div className="md:col-span-3">
        <SubmitButton>Create account</SubmitButton>
        {state && state.ok && !onSuccess && <span className="ml-3 text-sm text-success">Created.</span>}
      </div>
    </form>
  );
}
