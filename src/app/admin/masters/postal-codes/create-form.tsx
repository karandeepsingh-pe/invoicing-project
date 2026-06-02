"use client";

import { useActionState, useEffect } from "react";
import { createPostalCode } from "@/lib/actions/postal-code";
import { FormError, SubmitButton, TextField } from "@/components/admin/field";
import dynamic from "next/dynamic";
import { useActionToast } from "@/lib/hooks/use-action-toast";

// Lazy-load the country/state/city picker (~7.8MB country-state-city dataset)
// so this admin page does not ship it in the initial bundle.
const CascadingPlace = dynamic(
  () =>
    import("@/components/admin/cascading-place").then((m) => m.CascadingPlace),
  { ssr: false },
);

export function PostalCodeCreateForm({ onSuccess }: { onSuccess?: () => void } = {}) {
  const [state, action] = useActionState(createPostalCode, null);
  const fieldErrors = state && state.ok === false ? state.fieldErrors : undefined;
  const formError = state && state.ok === false ? state.formError : undefined;

  useActionToast(state, {
    success: { title: "Postal code added" },
    error: { fallbackTitle: "Failed to add postal code" },
  });

  useEffect(() => {
    if (state && state.ok) onSuccess?.();
  }, [state, onSuccess]);

  return (
    <form action={action} className="grid grid-cols-1 gap-3 md:grid-cols-3">
      <FormError error={formError} />
      <TextField
        label="Zipcode"
        name="zipcode"
        required
        placeholder="94016"
        errors={fieldErrors?.zipcode}
        hint="Unique per row."
      />
      <TextField
        label="Sort order"
        name="sortOrder"
        type="number"
        defaultValue={0}
        min={0}
        errors={fieldErrors?.sortOrder}
      />
      <CascadingPlace
        fieldNames={{ country: "country", state: "state", city: "city" }}
        errors={{
          country: fieldErrors?.country,
          state: fieldErrors?.state,
          city: fieldErrors?.city,
        }}
        required
      />
      <div className="self-end md:col-span-3">
        <SubmitButton>Add postal code</SubmitButton>
        {state && state.ok && !onSuccess && (
          <span className="ml-3 text-sm text-success">Added.</span>
        )}
      </div>
    </form>
  );
}
