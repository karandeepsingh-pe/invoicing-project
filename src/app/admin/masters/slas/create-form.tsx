"use client";

import { useActionState, useEffect } from "react";
import { createSla } from "@/lib/actions/sla";
import { FormError, SubmitButton, TextField } from "@/components/admin/field";
import { useActionToast } from "@/lib/hooks/use-action-toast";

export function SlaCreateForm({ onSuccess }: { onSuccess?: () => void } = {}) {
  const [state, action] = useActionState(createSla, null);
  const fieldErrors = state && state.ok === false ? state.fieldErrors : undefined;
  const formError = state && state.ok === false ? state.formError : undefined;

  useActionToast(state, {
    success: { title: "SLA added" },
    error: { fallbackTitle: "Failed to add SLA" },
  });

  useEffect(() => {
    if (state && state.ok) onSuccess?.();
  }, [state, onSuccess]);

  return (
    <form action={action} className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <FormError error={formError} />
      <TextField
        label="Code"
        name="code"
        required
        placeholder="NBD"
        errors={fieldErrors?.code}
        hint="Short uppercase code."
      />
      <TextField
        label="Label"
        name="label"
        required
        placeholder="Next business day"
        errors={fieldErrors?.label}
      />
      <TextField
        label="Sort order"
        name="sortOrder"
        type="number"
        defaultValue={0}
        min={0}
        errors={fieldErrors?.sortOrder}
      />
      <div className="self-end">
        <SubmitButton>Add SLA</SubmitButton>
        {state && state.ok && !onSuccess && <span className="ml-3 text-sm text-success">Added.</span>}
      </div>
    </form>
  );
}
