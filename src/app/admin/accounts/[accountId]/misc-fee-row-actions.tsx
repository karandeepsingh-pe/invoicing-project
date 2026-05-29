"use client";

import { useActionState, useTransition } from "react";
import { deleteMiscFee } from "@/lib/actions/misc-fee";
import { ConfirmDialog } from "@/components/admin/confirm-dialog";
import { useActionToast } from "@/lib/hooks/use-action-toast";

export function MiscFeeDeleteButton({ id, label }: { id: string; label?: string }) {
  const [state, action] = useActionState(deleteMiscFee, null);
  const [pending, startTransition] = useTransition();

  useActionToast(state, {
    success: { title: label ? `Deleted misc fee "${label}"` : "Misc fee deleted" },
    error: { fallbackTitle: "Cannot delete misc fee" },
  });

  return (
    <ConfirmDialog
      trigger={
        <button
          type="button"
          disabled={pending}
          className="text-xs font-medium text-danger underline-offset-2 hover:underline disabled:opacity-50"
        >
          Delete
        </button>
      }
      title={label ? `Delete misc fee "${label}"?` : "Delete misc fee?"}
      body="Removes this fee row from the account."
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
