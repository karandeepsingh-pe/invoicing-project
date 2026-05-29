"use client";

import { AddButton, Dialog } from "@/components/admin/dialog";
import {
  TechnicianCreateForm,
  type AccountOption,
  type ExistingTech,
} from "./create-form";

export function TechnicianCreateDialog({
  orgs,
  accounts = [],
  existingTechs = [],
}: {
  orgs: { id: string; name: string }[];
  accounts?: AccountOption[];
  existingTechs?: ExistingTech[];
}) {
  return (
    <Dialog
      trigger={<AddButton label="Add technician" size="md" />}
      title="Add technician"
      description="Optionally assign to an account immediately — creates tech + assignment in one transaction."
      size="xl"
    >
      {({ close }) =>
        orgs.length === 0 ? (
          <p className="text-sm text-fg-muted">
            Create an org first so the technician has an employer.
          </p>
        ) : (
          <TechnicianCreateForm
            orgs={orgs}
            accounts={accounts}
            existingTechs={existingTechs}
            onSuccess={close}
          />
        )
      }
    </Dialog>
  );
}
