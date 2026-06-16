"use client";

import { Dialog } from "@/components/admin/dialog";
import {
  AccountAssignmentCreateForm,
  type TechOption,
} from "@/app/admin/accounts/[accountId]/create-assignment-form";

export function AssignTechToAccountDialog({
  clientAccountId,
  accountLabel,
  technicians,
}: {
  clientAccountId: string;
  accountLabel: string;
  technicians: TechOption[];
}) {
  return (
    <Dialog
      trigger={
        <button
          type="button"
          className="text-[11px] font-medium text-accent hover:text-accent-hover"
        >
          Assign
        </button>
      }
      title={`Assign technicians to ${accountLabel}`}
      description="Pick one or more employed technicians. Employ new techs from the client roster on the right."
      size="lg"
    >
      {({ close }) => (
        <AccountAssignmentCreateForm
          clientAccountId={clientAccountId}
          accountLabel={accountLabel}
          technicians={technicians}
          onSuccess={close}
        />
      )}
    </Dialog>
  );
}
