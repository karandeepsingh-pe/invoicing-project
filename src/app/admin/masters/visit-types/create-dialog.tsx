"use client";

import { AddButton, Dialog } from "@/components/admin/dialog";
import { VisitTypeCreateForm } from "./create-form";

export function VisitTypeCreateDialog() {
  return (
    <Dialog
      trigger={<AddButton label="Add visit type" size="md" />}
      title="Add visit type"
      description="Code is unique. Sort order controls position in the dispatch picker."
    >
      {({ close }) => <VisitTypeCreateForm onSuccess={close} />}
    </Dialog>
  );
}
