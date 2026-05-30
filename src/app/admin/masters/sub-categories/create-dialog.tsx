"use client";

import { RateCategory } from "@prisma/client";
import { AddButton, Dialog } from "@/components/admin/dialog";
import { SubCategoryCreateForm } from "./create-form";

const categoryLabel: Record<RateCategory, string> = {
  DEDICATED: "Dedicated",
  PROJECT_TM: "Project / T&M",
  DISPATCH_SCHED: "Dispatch + Scheduled Visit",
};

export function SubCategoryCreateDialog({
  lockedCategory,
}: {
  lockedCategory?: RateCategory;
} = {}) {
  const title = lockedCategory
    ? `Add ${categoryLabel[lockedCategory]} sub-category`
    : "Add rate sub-category";
  return (
    <Dialog
      trigger={<AddButton label="Add sub-category" />}
      title={title}
      description="Code is unique within its rate category."
      size="lg"
    >
      {({ close }) => <SubCategoryCreateForm lockedCategory={lockedCategory} onSuccess={close} />}
    </Dialog>
  );
}
