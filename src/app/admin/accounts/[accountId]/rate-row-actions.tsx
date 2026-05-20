"use client";

import { useActionState } from "react";
import { deleteAccountRate, updateAccountRateAmount } from "@/lib/actions/account-rate";

export function AccountRateRowActions({
  id,
  currentAmount,
}: {
  id: string;
  currentAmount: string;
}) {
  const [, updateAction] = useActionState(updateAccountRateAmount, null);
  const [, deleteAction] = useActionState(deleteAccountRate, null);

  return (
    <div className="flex items-center justify-end gap-2">
      <form action={updateAction} className="flex items-center gap-1">
        <input type="hidden" name="id" value={id} />
        <input
          type="number"
          step="0.0001"
          min="0"
          name="rateAmount"
          defaultValue={currentAmount}
          placeholder="set"
          className="w-24 rounded-md border border-border-strong bg-surface px-2 py-1 text-xs text-fg outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
        />
        <button
          type="submit"
          className="rounded-md border border-border-strong bg-surface px-2 py-1 text-xs font-medium text-fg-muted transition-colors hover:bg-surface-2 hover:text-fg"
        >
          Save
        </button>
      </form>
      <form action={deleteAction}>
        <input type="hidden" name="id" value={id} />
        <button
          type="submit"
          className="text-xs font-medium text-danger underline-offset-2 hover:underline"
        >
          Delete
        </button>
      </form>
    </div>
  );
}
