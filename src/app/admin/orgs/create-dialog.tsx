"use client";

import { AddButton, Dialog } from "@/components/admin/dialog";
import { OrgCreateForm } from "./create-form";

export function OrgCreateDialog() {
  return (
    <Dialog
      trigger={<AddButton label="Add client" size="md" />}
      title="Create client"
      description="Pick the output template — HCL gets FSO; everyone else gets PRE_INVOICE."
    >
      {({ close }) => <OrgCreateForm onSuccess={close} />}
    </Dialog>
  );
}
