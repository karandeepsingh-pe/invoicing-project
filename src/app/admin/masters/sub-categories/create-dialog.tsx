"use client";

import { AddButton, Dialog } from "@/components/admin/dialog";
import { SubCategoryCreateForm } from "./create-form";

export function SubCategoryCreateDialog() {
  return (
    <Dialog
      trigger={<AddButton label="Add sub-category" size="md" />}
      title="Add rate sub-category"
      description="Code is unique within its rate category."
      size="lg"
    >
      {({ close }) => <SubCategoryCreateForm onSuccess={close} />}
    </Dialog>
  );
}
