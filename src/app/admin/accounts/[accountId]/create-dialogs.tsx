"use client";

import { RateCategory } from "@prisma/client";
import { AddButton, Dialog } from "@/components/admin/dialog";
import { AccountRateCreateForm } from "./create-rate-form";
import { MiscFeeCreateForm } from "./create-misc-fee-form";

type SubCat = { id: string; rateCategory: RateCategory; code: string; label: string };
type Sla = { id: string; code: string; label: string };

const categoryLabel: Record<RateCategory, string> = {
  DEDICATED: "Dedicated",
  PROJECT_TM: "Project / T&M",
  DISPATCH_SCHED: "Dispatch",
  SCHEDULED: "Scheduled Visit",
};

export function AccountRateCreateDialog(props: {
  clientAccountId: string;
  subCategories: SubCat[];
  slas: Sla[];
  lockedCategory?: RateCategory;
}) {
  const title = props.lockedCategory
    ? `Add ${categoryLabel[props.lockedCategory]} rate row`
    : "Add rate row";
  return (
    <Dialog
      trigger={<AddButton label="Add rate row" />}
      title={title}
      description="Pick a sub-category, SLA, and band."
      size="xl"
    >
      {({ close }) => <AccountRateCreateForm {...props} onSuccess={close} />}
    </Dialog>
  );
}

export function MiscFeeCreateDialog({ clientAccountId }: { clientAccountId: string }) {
  return (
    <Dialog
      trigger={<AddButton label="Add misc fee" />}
      title="Add miscellaneous fee"
      description="Retainer, mileage, BGV cost, per diem, toolkit, or account-specific item."
      size="lg"
    >
      {({ close }) => <MiscFeeCreateForm clientAccountId={clientAccountId} onSuccess={close} />}
    </Dialog>
  );
}
