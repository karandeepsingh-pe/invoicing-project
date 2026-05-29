"use client";

import { AddButton, Dialog } from "@/components/admin/dialog";
import { PostalCodeCreateForm } from "./create-form";

export function PostalCodeCreateDialog() {
  return (
    <Dialog
      trigger={<AddButton label="Add postal code" size="md" />}
      title="Add postal code"
      description="Zipcode is unique. Technician forms look up by this value to auto-fill city, state, and country."
      size="lg"
    >
      {({ close }) => <PostalCodeCreateForm onSuccess={close} />}
    </Dialog>
  );
}
