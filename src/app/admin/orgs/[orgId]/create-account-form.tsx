"use client";

import { useActionState, useEffect } from "react";
import { createClientAccount } from "@/lib/actions/client-account";
import { FormError, SubmitButton, TextField } from "@/components/admin/field";

export function ClientAccountCreateForm({
  orgId,
  defaultCurrency,
  onSuccess,
}: {
  orgId: string;
  defaultCurrency: string;
  onSuccess?: () => void;
}) {
  const [state, action] = useActionState(createClientAccount, null);
  const fieldErrors = state && state.ok === false ? state.fieldErrors : undefined;
  const formError = state && state.ok === false ? state.formError : undefined;

  useEffect(() => {
    if (state && state.ok) onSuccess?.();
  }, [state, onSuccess]);

  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="orgId" value={orgId} />
      <FormError error={formError} />
      <TextField label="Account name" name="name" required errors={fieldErrors?.name} />
      <TextField
        label="Currency override"
        name="currency"
        maxLength={3}
        placeholder={defaultCurrency}
        hint={`Leave blank to inherit org default (${defaultCurrency}).`}
        errors={fieldErrors?.currency}
      />
      <SubmitButton>Create account</SubmitButton>
      {state && state.ok && !onSuccess && <div className="text-sm text-success">Account created.</div>}
    </form>
  );
}
