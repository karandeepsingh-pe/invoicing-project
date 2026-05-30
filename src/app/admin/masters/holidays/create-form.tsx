"use client";

import { useActionState, useEffect } from "react";
import { createHoliday } from "@/lib/actions/holiday";
import { FormError, SubmitButton, TextField } from "@/components/admin/field";
import { useActionToast } from "@/lib/hooks/use-action-toast";

export function HolidayCreateForm({ onSuccess }: { onSuccess?: () => void } = {}) {
  const [state, action] = useActionState(createHoliday, null);
  const fieldErrors = state && state.ok === false ? state.fieldErrors : undefined;
  const formError = state && state.ok === false ? state.formError : undefined;

  useActionToast(state, {
    success: { title: "Holiday added" },
    error: { fallbackTitle: "Failed to add holiday" },
  });

  useEffect(() => {
    if (state && state.ok) onSuccess?.();
  }, [state, onSuccess]);

  return (
    <form action={action} className="grid grid-cols-1 gap-3 md:grid-cols-3">
      <FormError error={formError} />
      <TextField label="Date" name="date" type="date" required errors={fieldErrors?.date} />
      <TextField
        label="Name"
        name="name"
        required
        placeholder="Christmas"
        errors={fieldErrors?.name}
      />
      <div className="self-end">
        <SubmitButton>Add holiday</SubmitButton>
        {state && state.ok && !onSuccess && (
          <span className="ml-3 text-sm text-success">Added.</span>
        )}
      </div>
    </form>
  );
}
