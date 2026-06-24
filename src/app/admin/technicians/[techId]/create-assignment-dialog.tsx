"use client";

import { AssignmentSlaTier, RateCategory } from "@prisma/client";
import type { TechnicianFlags } from "@/lib/domain/technician-pools";
import { AddButton, Dialog } from "@/components/admin/dialog";
import { AssignmentCreateForm, type AccountOption } from "./create-assignment-form";

export function AssignmentCreateDialog({
  technicianId,
  technicianBand,
  primaryCategory,
  defaultSlaTier,
  accounts,
  flags,
  hasActiveDedication,
  technicianStartDate,
}: {
  technicianId: string;
  technicianBand: number;
  primaryCategory: RateCategory;
  defaultSlaTier: AssignmentSlaTier;
  accounts: AccountOption[];
  flags: TechnicianFlags;
  hasActiveDedication: boolean;
  technicianStartDate?: string | null;
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
            defaultSlaTier={defaultSlaTier}
            accounts={accounts}
            flags={flags}
            hasActiveDedication={hasActiveDedication}
            technicianStartDate={technicianStartDate}
            onSuccess={close}
          />
        )
      }
    </Dialog>
  );
}
