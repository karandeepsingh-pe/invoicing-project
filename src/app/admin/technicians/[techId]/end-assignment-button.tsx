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
        className="rounded border border-neutral-300 px-1.5 py-0.5 text-xs dark:border-neutral-700 dark:bg-neutral-900"
      />
      <button
        type="submit"
        className="rounded border border-neutral-300 px-2 py-0.5 text-xs hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-800"
      >
        end
      </button>
      {state && state.ok === false && (
        <span className="text-xs text-red-600">{state.formError}</span>
      )}
    </form>
  );
}
