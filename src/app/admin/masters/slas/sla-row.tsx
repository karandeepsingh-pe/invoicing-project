"use client";

import { useActionState, useState, useTransition } from "react";
import { deleteSla, updateSla } from "@/lib/actions/sla";
import { ConfirmDialog } from "@/components/admin/confirm-dialog";
import { useActionToast } from "@/lib/hooks/use-action-toast";

export function SlaRowActions({
  id,
  code,
  label,
  sortOrder,
}: {
  id: string;
  code: string;
  label: string;
  sortOrder: number;
}) {
  const [editing, setEditing] = useState(false);
  const [updateState, updateAction, updating] = useActionState(updateSla, null);
  const [deleteState, deleteAction] = useActionState(deleteSla, null);
  const [pending, startTransition] = useTransition();

  useActionToast(updateState, {
    success: { title: `SLA "${code}" updated` },
    error: { fallbackTitle: `Failed to update "${code}"` },
  });
  useActionToast(deleteState, {
    success: { title: `Deleted SLA "${code}"` },
    error: { fallbackTitle: `Cannot delete "${code}"` },
  });

  if (editing) {
    return (
      <form action={updateAction} className="flex items-center justify-end gap-1.5">
        <input type="hidden" name="id" value={id} />
        <input
          name="code"
          defaultValue={code}
          required
          className="glass-input w-20 rounded-md px-2 py-1 text-xs"
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
        title={`Delete SLA "${code}"?`}
        body="Blocked if any account rate row still references this SLA."
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
