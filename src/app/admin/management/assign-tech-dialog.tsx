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
  backfillAllowed = true,
}: {
  clientAccountId: string;
  accountLabel: string;
  technicians: TechOption[];
  backfillAllowed?: boolean;
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
      title={`Assign technician to ${accountLabel}`}
      description="Pick an existing employed technician. Employ new techs from the org roster on the right."
      size="lg"
    >
      {({ close }) => (
        <AccountAssignmentCreateForm
          clientAccountId={clientAccountId}
          accountLabel={accountLabel}
          technicians={technicians}
          backfillAllowed={backfillAllowed}
          onSuccess={close}
        />
      )}
    </Dialog>
  );
}
