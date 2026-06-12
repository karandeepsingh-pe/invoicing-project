"use client";

import { useActionState, useEffect } from "react";
import { createVisitType } from "@/lib/actions/visit-type";
import { FormError, SubmitButton, TextField } from "@/components/admin/field";
import { useActionToast } from "@/lib/hooks/use-action-toast";

export function VisitTypeCreateForm({ onSuccess }: { onSuccess?: () => void } = {}) {
  const [state, action] = useActionState(createVisitType, null);
  const fieldErrors = state && state.ok === false ? state.fieldErrors : undefined;
  const formError = state && state.ok === false ? state.formError : undefined;

  useActionToast(state, {
    success: { title: "Visit type added" },
    error: { fallbackTitle: "Failed to add visit type" },
  });

  useEffect(() => {
    if (state && state.ok) onSuccess?.();
  }, [state, onSuccess]);

  return (
    <form action={action} className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <FormError error={formError} />
      <TextField label="Code" name="code" required placeholder="INSTALL" errors={fieldErrors?.code} hint="Uppercase." />
      <TextField label="Label" name="label" required placeholder="Install" errors={fieldErrors?.label} />
      <TextField label="Sort order" name="sortOrder" type="number" defaultValue={0} min={0} errors={fieldErrors?.sortOrder} />
      <div className="self-end">
        <SubmitButton>Add visit type</SubmitButton>
        {state && state.ok && !onSuccess && <span className="ml-3 text-sm text-success">Added.</span>}
      </div>
    </form>
  );
}
