"use client";

import { useActionState } from "react";
import { endAssignment } from "@/lib/actions/assignment";

export function EndAssignmentButton({ id }: { id: string }) {
  const [state, action] = useActionState(endAssignment, null);
  const today = new Date().toISOString().slice(0, 10);
  return (
    <form action={action} className="flex items-center justify-end gap-2">
      <input type="hidden" name="id" value={id} />
      <input
        type="date"
        name="endDate"
        defaultValue={today}
        className="rounded-md border border-border-strong bg-surface px-2 py-1 text-xs text-fg outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
      />
      <button
        type="submit"
        className="rounded-md border border-border-strong bg-surface px-2 py-1 text-xs font-medium text-fg-muted transition-colors hover:bg-surface-2 hover:text-fg"
      >
        End
      </button>
      {state && state.ok === false && (
        <span className="text-xs text-danger">{state.formError}</span>
      )}
    </form>
  );
}
