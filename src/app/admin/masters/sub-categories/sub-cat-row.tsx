"use client";

import { useActionState, useState, useTransition } from "react";
import { RateCategory } from "@prisma/client";
import { deleteRateSubCategory, updateRateSubCategory } from "@/lib/actions/rate-sub-category";
import { ConfirmDialog } from "@/components/admin/confirm-dialog";
import { useActionToast } from "@/lib/hooks/use-action-toast";

const categoryLabel: Record<RateCategory, string> = {
  DEDICATED: "Dedicated",
  PROJECT_TM: "Project / T&M",
  DISPATCH_SCHED: "Dispatch",
  SCHEDULED: "Scheduled Visit",
};

export function SubCategoryRowActions({
  id,
  code,
  label,
  rateCategory,
  sortOrder,
  isOvertimeVariant,
}: {
  id: string;
  code: string;
  label: string;
  rateCategory: RateCategory;
  sortOrder: number;
  isOvertimeVariant: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [updateState, updateAction, updating] = useActionState(updateRateSubCategory, null);
  const [deleteState, deleteAction] = useActionState(deleteRateSubCategory, null);
  const [pending, startTransition] = useTransition();

  useActionToast(updateState, {
    success: { title: `Sub-category "${code}" updated` },
    error: { fallbackTitle: `Failed to update "${code}"` },
  });
  useActionToast(deleteState, {
    success: { title: `Deleted sub-category "${code}"` },
    error: { fallbackTitle: `Cannot delete "${code}"` },
  });

  if (editing) {
    return (
      <form action={updateAction} className="flex flex-wrap items-center justify-end gap-1.5">
        <input type="hidden" name="id" value={id} />
        <select
          name="rateCategory"
          defaultValue={rateCategory}
          className="glass-input rounded-md px-2 py-1 text-xs"
        >
          {Object.values(RateCategory).map((c) => (
            <option key={c} value={c}>
              {categoryLabel[c]}
            </option>
          ))}
        </select>
        <input
          name="code"
          defaultValue={code}
          required
          className="glass-input w-32 rounded-md px-2 py-1 text-xs"
        />
        <input
          name="label"
          defaultValue={label}
          required
          className="glass-input w-48 rounded-md px-2 py-1 text-xs"
        />
        <input
          name="sortOrder"
          type="number"
          defaultValue={sortOrder}
          min={0}
          className="glass-input w-16 rounded-md px-2 py-1 text-xs"
        />
        <label className="inline-flex items-center gap-1 text-[11px] text-fg-muted">
          <input
            type="checkbox"
            name="isOvertimeVariant"
            defaultChecked={isOvertimeVariant}
            className="h-3.5 w-3.5 rounded border-border-strong text-accent accent-accent focus:ring-accent"
          />
          OT variant
        </label>
        <button
          type="submit"
          disabled={updating}
          className="rounded-md border border-border-strong bg-accent/10 px-2 py-1 text-xs font-medium text-accent transition-colors hover:bg-accent/20 disabled:opacity-50"
        >
          {updating ? "Saving…" : "Save"}
        </button>
        <button
          type="button"
          onClick={() => setEditing(false)}
          className="text-xs font-medium text-fg-subtle hover:text-fg"
        >
          Cancel
        </button>
      </form>
    );
  }

  return (
    <div className="flex items-center justify-end gap-2">
      <button
        type="button"
        onClick={() => setEditing(true)}
        className="rounded-md border border-border-strong bg-surface/60 px-2 py-1 text-xs font-medium text-fg-muted backdrop-blur transition-colors hover:bg-surface hover:text-fg"
      >
        Edit
      </button>
      <ConfirmDialog
        trigger={
          <button
            type="button"
            disabled={pending}
            className="rounded-md border border-border-strong bg-surface/60 px-2 py-1 text-xs font-medium text-danger backdrop-blur transition-colors hover:bg-danger-bg disabled:opacity-50"
          >
            {pending ? "Deleting…" : "Delete"}
          </button>
        }
        title={`Delete sub-category "${code}"?`}
        body="Blocked if any account rate row still references this sub-category."
        destructive
        confirmLabel="Delete"
        onConfirm={() => {
          startTransition(() => {
            const fd = new FormData();
            fd.append("id", id);
            deleteAction(fd);
          });
        }}
      />
    </div>
  );
}
