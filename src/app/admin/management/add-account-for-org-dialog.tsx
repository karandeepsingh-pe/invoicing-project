"use client";

import { Dialog } from "@/components/admin/dialog";
import { ClientAccountCreateForm } from "@/app/admin/orgs/[orgId]/create-account-form";

export function AddAccountForOrgDialog({
  orgId,
  orgName,
  defaultCurrency,
}: {
  orgId: string;
  orgName: string;
  defaultCurrency: string;
}) {
  return (
    <Dialog
      trigger={
        <button
          type="button"
          className="ui-link-accent text-xs font-medium"
        >
          + Add account
        </button>
      }
      title={`Create account under ${orgName}`}
      description={`Defaults to client currency (${defaultCurrency}) unless overridden.`}
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
