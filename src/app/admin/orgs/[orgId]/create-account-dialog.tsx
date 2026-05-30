"use client";

import { AddButton, Dialog } from "@/components/admin/dialog";
import { ClientAccountCreateForm } from "./create-account-form";

export function CreateAccountUnderOrgDialog({
  orgId,
  defaultCurrency,
}: {
  orgId: string;
  defaultCurrency: string;
}) {
  return (
    <Dialog
      trigger={<AddButton label="Add account" size="md" />}
      title="Create client account"
      description={`Defaults to org currency (${defaultCurrency}) unless overridden.`}
    >
      {({ close }) => (
        <ClientAccountCreateForm
          orgId={orgId}
          defaultCurrency={defaultCurrency}
          onSuccess={close}
        />
      )}
    </Dialog>
  );
}
