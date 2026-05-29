"use client";

import { Dialog } from "@/components/admin/dialog";
import { TechnicianCreateForm, type ExistingTech } from "@/app/admin/technicians/create-form";

export function AddTechForOrgDialog({
  orgId,
  orgName,
  existingTechs = [],
}: {
  orgId: string;
  orgName: string;
  existingTechs?: ExistingTech[];
}) {
  return (
    <Dialog
      trigger={
        <button
          type="button"
          className="text-xs font-medium text-accent hover:text-accent-hover"
        >
          + Employ technician
        </button>
      }
      title={`Employ technician at ${orgName}`}
      description="Adds them to this org's roster only — it does NOT assign them to an account. Use Assign on a client account (left) to put them on an account."
      size="lg"
    >
      {({ close }) => (
        <TechnicianCreateForm
          orgs={[{ id: orgId, name: orgName }]}
          existingTechs={existingTechs}
          onSuccess={close}
        />
      )}
    </Dialog>
  );
}
