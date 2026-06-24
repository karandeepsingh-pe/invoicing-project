"use client";

import { AddButton, Dialog } from "@/components/admin/dialog";
import { OrgCreateForm } from "./create-form";

export function OrgCreateDialog() {
  return (
    <Dialog
      trigger={<AddButton label="Add client" size="md" />}
      title="Create client"
      description="Choose the output template. HCL uses FSO; everyone else uses Pre-Invoice."
    >
      {({ close }) => <OrgCreateForm onSuccess={close} />}
    </Dialog>
  );
}
