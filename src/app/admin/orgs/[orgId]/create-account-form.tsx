"use client";

import { useActionState, useEffect } from "react";
import type { RateBasis } from "@prisma/client";
import { createClientAccount } from "@/lib/actions/client-account";
import { FormError, SubmitButton, TextField } from "@/components/admin/field";
import { PolicyOverrideFields } from "@/components/admin/policy-override-fields";
import { useActionToast } from "@/lib/hooks/use-action-toast";

export function ClientAccountCreateForm({
  orgId,
  defaultCurrency,
  orgBackfillAllowed,
  orgRateBasis,
  onSuccess,
}: {
  orgId: string;
  defaultCurrency: string;
  orgBackfillAllowed: boolean;
  orgRateBasis: RateBasis;
  onSuccess?: () => void;
}) {
  const [state, action] = useActionState(createClientAccount, null);
  const fieldErrors = state && state.ok === false ? state.fieldErrors : undefined;
  const formError = state && state.ok === false ? state.formError : undefined;

  useActionToast(state, {
    success: { title: "Account created" },
    error: { fallbackTitle: "Failed to create account" },
  });

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
      <TextField
        label="Client POC name"
        name="clientPocName"
        placeholder="e.g. Eeshan Chambial"
        errors={fieldErrors?.clientPocName}
        hint="Shown on the pre-invoice header."
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
        hint="Free text — shown on the pre-invoice header."
      />
      <TextField
        label="Default Hours"
        name="defaultHours"
        type="number"
        min={1}
        max={24}
        defaultValue={8}
        errors={fieldErrors?.defaultHours}
        hint="Hours counted as one full working day. Pre-fills FTE weekday cells; anything above becomes OT."
      />
      <PolicyOverrideFields orgBackfillAllowed={orgBackfillAllowed} orgRateBasis={orgRateBasis} />
      <SubmitButton>Create account</SubmitButton>
      {state && state.ok && !onSuccess && <div className="text-sm text-success">Account created.</div>}
    </form>
  );
}
