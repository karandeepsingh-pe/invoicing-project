"use client";

import { useActionState, useEffect } from "react";
import { updatePostalCode } from "@/lib/actions/postal-code";
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

export function PostalCodeEditForm({
  id,
  zipcode,
  city,
  state,
  country,
  sortOrder,
  onSuccess,
}: {
  id: string;
  zipcode: string;
  city: string;
  state: string;
  country: string;
  sortOrder: number;
  onSuccess?: () => void;
}) {
  const [actionState, action] = useActionState(updatePostalCode, null);
  const fieldErrors =
    actionState && actionState.ok === false ? actionState.fieldErrors : undefined;
  const formError =
    actionState && actionState.ok === false ? actionState.formError : undefined;

  useActionToast(actionState, {
    success: { title: `Postal code "${zipcode}" updated` },
    error: { fallbackTitle: `Failed to update "${zipcode}"` },
  });

  useEffect(() => {
    if (actionState && actionState.ok) onSuccess?.();
  }, [actionState, onSuccess]);

  return (
    <form action={action} className="grid grid-cols-1 gap-3 md:grid-cols-3">
      <input type="hidden" name="id" value={id} />
      <FormError error={formError} />
      <TextField
        label="Zipcode"
        name="zipcode"
        required
        defaultValue={zipcode}
        errors={fieldErrors?.zipcode}
      />
      <TextField
        label="Sort order"
        name="sortOrder"
        type="number"
        defaultValue={sortOrder}
        min={0}
        errors={fieldErrors?.sortOrder}
      />
      <CascadingPlace
        fieldNames={{ country: "country", state: "state", city: "city" }}
        initialCountry={country}
        initialState={state}
        initialCity={city}
        errors={{
          country: fieldErrors?.country,
          state: fieldErrors?.state,
          city: fieldErrors?.city,
        }}
        required
      />
      <div className="self-end md:col-span-3">
        <SubmitButton>Save changes</SubmitButton>
      </div>
    </form>
  );
}
