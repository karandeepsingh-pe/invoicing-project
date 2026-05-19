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
          className="w-24 rounded border border-neutral-300 px-1.5 py-0.5 text-xs dark:border-neutral-700 dark:bg-neutral-900"
        />
        <button
          type="submit"
          className="rounded border border-neutral-300 px-1.5 py-0.5 text-xs hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-800"
        >
          save
        </button>
      </form>
      <form action={deleteAction}>
        <input type="hidden" name="id" value={id} />
        <button
          type="submit"
          className="text-xs text-red-600 underline hover:text-red-800"
        >
          delete
        </button>
      </form>
    </div>
  );
}
