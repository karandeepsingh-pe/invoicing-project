"use client";

import { AddButton, Dialog } from "@/components/admin/dialog";
import { TechnicianCreateForm, type ExistingTech } from "../../technicians/create-form";

export function AccountAddTechnicianDialog({
  accountId,
  accountName,
  defaultEmployerOrgId,
  orgs,
  existingTechs,
}: {
  accountId: string;
  accountName: string;
  defaultEmployerOrgId: string;
  orgs: { id: string; name: string }[];
  existingTechs?: ExistingTech[];
}) {
  return (
    <Dialog
      trigger={<AddButton label="Add technician" size="md" />}
      title={`Add technician — ${accountName}`}
      description="Creates a new technician and assigns them to this account as Dedicated."
      size="lg"
    >
      {({ close }) => (
        <TechnicianCreateForm
          orgs={orgs}
          existingTechs={existingTechs}
          accountContext={{ id: accountId, name: accountName }}
          defaultEmployerOrgId={defaultEmployerOrgId}
          onSuccess={close}
        />
      )}
    </Dialog>
  );
}
