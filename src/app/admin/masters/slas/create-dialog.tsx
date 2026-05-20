"use client";

import { AddButton, Dialog } from "@/components/admin/dialog";
import { SlaCreateForm } from "./create-form";

export function SlaCreateDialog() {
  return (
    <Dialog
      trigger={<AddButton label="Add SLA" size="md" />}
      title="Add SLA"
      description="Code is unique. Sort order controls position in dropdowns."
    >
      {({ close }) => <SlaCreateForm onSuccess={close} />}
    </Dialog>
  );
}
