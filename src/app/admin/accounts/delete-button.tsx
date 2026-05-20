"use client";

import { useActionState } from "react";
import { deleteClientAccount } from "@/lib/actions/client-account";

export function ClientAccountDeleteButton({ id, name }: { id: string; name: string }) {
  const [state, action, pending] = useActionState(deleteClientAccount, null);
  const error = state && state.ok === false ? state.formError : undefined;

  return (
    <div className="flex flex-col items-end gap-1">
      <form
        action={action}
        onSubmit={(e) => {
          if (!confirm(`Delete account "${name}"? This cannot be undone.`)) {
            e.preventDefault();
          }
        }}
      >
        <input type="hidden" name="id" value={id} />
        <button
          type="submit"
          disabled={pending}
          className="rounded-md border border-border-strong bg-surface px-2 py-1 text-xs font-medium text-danger transition-colors hover:bg-danger-bg disabled:opacity-50"
        >
          {pending ? "Deleting…" : "Delete"}
        </button>
      </form>
      {error && (
        <span className="max-w-[18rem] text-right text-[11px] leading-tight text-danger">
          {error}
        </span>
      )}
    </div>
  );
}
