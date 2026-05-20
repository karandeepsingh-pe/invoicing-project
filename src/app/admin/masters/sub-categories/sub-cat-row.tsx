"use client";

import { useActionState, useState } from "react";
import { RateCategory } from "@prisma/client";
import { deleteRateSubCategory, updateRateSubCategory } from "@/lib/actions/rate-sub-category";

const categoryLabel: Record<RateCategory, string> = {
  DEDICATED: "Dedicated",
  PROJECT_TM: "Project / T&M",
  DISPATCH_SCHED: "Dispatch + Scheduled Visit",
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
  const [deleteState, deleteAction, deleting] = useActionState(deleteRateSubCategory, null);

  const updateError = updateState && updateState.ok === false ? updateState.formError : undefined;
  const deleteError = deleteState && deleteState.ok === false ? deleteState.formError : undefined;

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
        {updateError && (
          <span className="ml-2 max-w-xs text-[11px] text-danger">{updateError}</span>
        )}
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
      <form
        action={deleteAction}
        onSubmit={(e) => {
          if (!confirm(`Delete sub-category "${code}"? This cannot be undone.`)) e.preventDefault();
        }}
      >
        <input type="hidden" name="id" value={id} />
        <button
          type="submit"
          disabled={deleting}
          className="rounded-md border border-border-strong bg-surface/60 px-2 py-1 text-xs font-medium text-danger backdrop-blur transition-colors hover:bg-danger-bg disabled:opacity-50"
        >
          {deleting ? "Deleting…" : "Delete"}
        </button>
      </form>
      {deleteError && (
        <span className="max-w-xs text-[11px] text-danger">{deleteError}</span>
      )}
    </div>
  );
}
