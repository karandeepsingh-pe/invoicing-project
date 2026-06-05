"use client";

import { useActionState, useTransition } from "react";
import { deleteAccountRate, updateAccountRateAmount } from "@/lib/actions/account-rate";
import { ConfirmDialog } from "@/components/admin/confirm-dialog";
import { useActionToast } from "@/lib/hooks/use-action-toast";

export function AccountRateRowActions({
  id,
  currentAmount,
}: {
  id: string;
  currentAmount: string;
}) {
  const [updateState, updateAction] = useActionState(updateAccountRateAmount, null);
  const [deleteState, deleteAction] = useActionState(deleteAccountRate, null);
  const [pending, startTransition] = useTransition();

  useActionToast(updateState, {
    success: { title: "Rate updated" },
    error: { fallbackTitle: "Failed to update rate" },
  });
  useActionToast(deleteState, {
    success: { title: "Rate row deleted" },
    error: { fallbackTitle: "Cannot delete rate row" },
  });

  return (
    <div className="flex items-center justify-end gap-2">
      <form action={updateAction} className="flex items-center gap-1">
        <input type="hidden" name="id" value={id} />
        <input
          type="number"
          step="0.0001"
          min="0"
          max="1000000"
          inputMode="decimal"
          name="rateAmount"
          defaultValue={currentAmount}
          placeholder="set"
          className="glass-input w-24 rounded-md px-2 py-1 text-xs text-fg"
        />
        <button
          type="submit"
          className="rounded-md border border-border-strong bg-surface/60 px-2 py-1 text-xs font-medium text-fg-muted transition-colors hover:bg-surface hover:text-fg"
        >
          Save
        </button>
      </form>
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
        title="Delete rate row?"
        body="This removes the row from the account's rate sheet. Any technician on an assignment that depends on this row will no longer inherit it."
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
