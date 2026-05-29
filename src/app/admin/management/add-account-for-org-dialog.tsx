"use client";

import type { RateBasis } from "@prisma/client";
import { Dialog } from "@/components/admin/dialog";
import { ClientAccountCreateForm } from "@/app/admin/orgs/[orgId]/create-account-form";

export function AddAccountForOrgDialog({
  orgId,
  orgName,
  defaultCurrency,
  orgBackfillAllowed,
  orgRateBasis,
}: {
  orgId: string;
  orgName: string;
  defaultCurrency: string;
  orgBackfillAllowed: boolean;
  orgRateBasis: RateBasis;
}) {
  return (
    <Dialog
      trigger={
        <button
          type="button"
          className="text-xs font-medium text-accent hover:text-accent-hover"
        >
          + Add account
        </button>
      }
      title={`Create account under ${orgName}`}
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
