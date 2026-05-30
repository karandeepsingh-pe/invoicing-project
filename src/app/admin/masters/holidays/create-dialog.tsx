"use client";

import { AddButton, Dialog } from "@/components/admin/dialog";
import { HolidayCreateForm } from "./create-form";

export function HolidayCreateDialog() {
  return (
    <Dialog
      trigger={<AddButton label="Add holiday" size="md" />}
      title="Add holiday"
      description="A date and a name. The date must be unique."
    >
      {({ close }) => <HolidayCreateForm onSuccess={close} />}
    </Dialog>
  );
}
