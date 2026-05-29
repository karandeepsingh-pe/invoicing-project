"use client";

import { AddButton, Dialog } from "@/components/admin/dialog";
import {
  AccountAssignmentCreateForm,
  type TechOption,
} from "./create-assignment-form";

export function AccountAssignmentCreateDialog({
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
      trigger={<AddButton label="Add assignment" size="md" />}
      title={`Assign technician to ${accountLabel}`}
      description="Pick an existing technician. Create new techs from the Technicians page or Management view."
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
