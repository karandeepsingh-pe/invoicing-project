"use client";

import { useActionState, useTransition } from "react";
import { deleteClientAccount } from "@/lib/actions/client-account";
import { ConfirmDialog } from "@/components/admin/confirm-dialog";
import { useActionToast } from "@/lib/hooks/use-action-toast";

export function ClientAccountDeleteButton({ id, name }: { id: string; name: string }) {
  const [state, action] = useActionState(deleteClientAccount, null);
  const [pending, startTransition] = useTransition();

  useActionToast(state, {
    success: { title: `Deleted account "${name}"` },
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
      title={`Delete account "${name}"?`}
      body={
        <span>
          This permanently removes the account along with its rate rows, misc fees, and
          SDM access entries. Blocked if it still has assignments or invoice runs.
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
