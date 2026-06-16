"use client";

import { AddButton, Dialog } from "@/components/admin/dialog";
import { PostalCodeCreateForm } from "./create-form";

export function PostalCodeCreateDialog() {
  return (
    <Dialog
      trigger={<AddButton label="Add postal code" size="md" />}
      title="Add postal code"
      description="Each zipcode is unique. Technician forms use it to fill in city, state, and country."
      size="lg"
    >
      {({ close }) => <PostalCodeCreateForm onSuccess={close} />}
    </Dialog>
  );
}
