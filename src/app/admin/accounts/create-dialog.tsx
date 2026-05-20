"use client";

import { AddButton, Dialog } from "@/components/admin/dialog";
import { ClientAccountCreateAnywhereForm } from "./create-form";

export function ClientAccountCreateDialog({
  orgs,
}: {
  orgs: { id: string; name: string; defaultCurrency: string }[];
}) {
  return (
    <Dialog
      trigger={<AddButton label="Add account" size="md" />}
      title="Create client account"
      description="Account name must be unique within its org."
      size="lg"
    >
      {({ close }) => <ClientAccountCreateAnywhereForm orgs={orgs} onSuccess={close} />}
    </Dialog>
  );
}
