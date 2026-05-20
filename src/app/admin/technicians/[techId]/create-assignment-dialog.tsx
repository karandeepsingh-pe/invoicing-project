"use client";

import { RateCategory } from "@prisma/client";
import { AddButton, Dialog } from "@/components/admin/dialog";
import { AssignmentCreateForm, type AccountOption } from "./create-assignment-form";

export function AssignmentCreateDialog({
  technicianId,
  technicianBand,
  primaryCategory,
  accounts,
}: {
  technicianId: string;
  technicianBand: number;
  primaryCategory: RateCategory;
  accounts: AccountOption[];
}) {
  return (
    <Dialog
      trigger={<AddButton label="New assignment" />}
      title="New assignment"
      description="Assign this technician to a client account. Rate preview updates as you pick."
      size="xl"
    >
      {({ close }) =>
        accounts.length === 0 ? (
          <p className="text-sm text-fg-muted">
            Create at least one client account with rate rows first.
          </p>
        ) : (
          <AssignmentCreateForm
            technicianId={technicianId}
            technicianBand={technicianBand}
            primaryCategory={primaryCategory}
            accounts={accounts}
            onSuccess={close}
          />
        )
      }
    </Dialog>
  );
}
