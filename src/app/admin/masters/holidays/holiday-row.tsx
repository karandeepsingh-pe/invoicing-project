"use client";

import { useActionState, useState, useTransition } from "react";
import { deleteHoliday, updateHoliday } from "@/lib/actions/holiday";
import { ConfirmDialog } from "@/components/admin/confirm-dialog";
import { useActionToast } from "@/lib/hooks/use-action-toast";

export function HolidayRowActions({
  id,
  date,
  name,
}: {
  id: string;
  date: string;
  name: string;
}) {
  const [editing, setEditing] = useState(false);
  const [updateState, updateAction, updating] = useActionState(updateHoliday, null);
  const [deleteState, deleteAction] = useActionState(deleteHoliday, null);
  const [pending, startTransition] = useTransition();

  useActionToast(updateState, {
    success: { title: `Holiday "${name}" updated` },
    error: { fallbackTitle: `Failed to update "${name}"` },
  });
  useActionToast(deleteState, {
    success: { title: `Deleted "${name}"` },
    error: { fallbackTitle: `Cannot delete "${name}"` },
  });

  if (editing) {
    return (
      <form action={updateAction} className="flex items-center justify-end gap-1.5">
        <input type="hidden" name="id" value={id} />
        <input
          name="date"
          type="date"
          defaultValue={date}
          required
          className="glass-input w-36 rounded-md px-2 py-1 text-xs"
        />
        <input
          name="name"
          defaultValue={name}
          required
          className="glass-input w-48 rounded-md px-2 py-1 text-xs"
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
        className="rounded-md border border-border-strong bg-surface/60 px-2 py-1 text-xs font-medium text-fg-muted transition-colors hover:bg-surface hover:text-fg"
      >
        Edit
      </button>
      <ConfirmDialog
        trigger={
          <button
            type="button"
            disabled={pending}
            className="rounded-md border border-border-strong bg-surface/60 px-2 py-1 text-xs font-medium text-danger transition-colors hover:bg-danger-bg disabled:opacity-50"
          >
            {pending ? "Deleting…" : "Delete"}
          </button>
        }
        title={`Delete holiday "${name}"?`}
        body="Removes it from the holiday calendar. Already-saved PH timesheet days are unaffected."
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
