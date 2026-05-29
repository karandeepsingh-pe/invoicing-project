"use client";

import { useActionState, useTransition } from "react";
import { deleteOrg } from "@/lib/actions/org";
import { ConfirmDialog } from "@/components/admin/confirm-dialog";
import { useActionToast } from "@/lib/hooks/use-action-toast";

export function OrgDeleteButton({ id, name }: { id: string; name: string }) {
  const [state, action] = useActionState(deleteOrg, null);
  const [pending, startTransition] = useTransition();

  useActionToast(state, {
    success: { title: `Deleted org "${name}"` },
    error: { fallbackTitle: `Cannot delete "${name}"` },
  });

  return (
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
      title={`Delete org "${name}"?`}
      body={
        <span>
          This permanently removes the org. Blocked if it still has any client accounts
          or technicians.
        </span>
      }
      destructive
      confirmLabel="Delete"
      onConfirm={() => {
        startTransition(() => {
          const fd = new FormData();
          fd.append("id", id);
          action(fd);
        });
      }}
    />
  );
}
