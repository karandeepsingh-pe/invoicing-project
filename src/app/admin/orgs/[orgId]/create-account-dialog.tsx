"use client";

import type { RateBasis } from "@prisma/client";
import { AddButton, Dialog } from "@/components/admin/dialog";
import { ClientAccountCreateForm } from "./create-account-form";

export function CreateAccountUnderOrgDialog({
  orgId,
  defaultCurrency,
  orgBackfillAllowed,
  orgRateBasis,
}: {
  orgId: string;
  defaultCurrency: string;
  orgBackfillAllowed: boolean;
  orgRateBasis: RateBasis;
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
          orgBackfillAllowed={orgBackfillAllowed}
          orgRateBasis={orgRateBasis}
          onSuccess={close}
        />
      )}
    </Dialog>
  );
}
