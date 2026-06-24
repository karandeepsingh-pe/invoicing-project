"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateAssignmentDates, reopenAssignment } from "@/lib/actions/assignment";
import { useToast } from "@/components/admin/toast-provider";
import type { ActionResult } from "@/lib/actions/result";
import { DeleteAssignmentButton } from "../../technicians/[techId]/delete-assignment-button";

const inputCls =
  "rounded-md border border-border-strong bg-surface px-2 py-1 text-xs text-fg outline-none focus:border-accent focus:ring-2 focus:ring-accent/20 disabled:opacity-60";

function errorBody(res: ActionResult): string | undefined {
  if (!res || res.ok) return undefined;
  if (res.formError) return res.formError;
  const first = Object.values(res.fieldErrors ?? {})
    .flat()
    .filter(Boolean)[0];
  return first ?? "Unknown error.";
}

/**
 * Inline start/end editor for one assignment row. Renders the Start, End, and
 * Actions table cells. START is always editable; END is editable only while it
 * is open (ongoing) — once set it shows read-only with a Reopen action that
 * clears it. Saving persists exactly the shown dates.
 */
export function AssignmentDatesEditor({
  id,
  startIso,
  endIso,
  accountLabel,
}: {
  id: string;
  startIso: string;
  endIso: string | null;
  accountLabel: string;
}) {
  const router = useRouter();
  const { push } = useToast();
  const [pending, start] = useTransition();
  const [startVal, setStartVal] = useState(startIso);
  const [endVal, setEndVal] = useState(endIso ?? "");

  const dirty = startVal !== startIso || (endIso === null && endVal !== "");

  function save() {
    start(async () => {
      const fd = new FormData();
      fd.append("id", id);
      fd.append("startDate", startVal);
      if (endIso === null) fd.append("endDate", endVal); // end only settable while open
      const res = await updateAssignmentDates(null, fd);
      if (res?.ok) {
        push({ variant: "success", title: "Assignment dates updated" });
        router.refresh();
      } else {
        push({ variant: "error", title: "Couldn't save dates", body: errorBody(res) });
      }
    });
  }

  function reopen() {
    start(async () => {
      const fd = new FormData();
      fd.append("id", id);
      const res = await reopenAssignment(null, fd);
      if (res?.ok) {
        push({ variant: "success", title: "Assignment reopened" });
        router.refresh();
      } else {
        push({ variant: "error", title: "Couldn't reopen", body: errorBody(res) });
      }
    });
  }

  return (
    <>
      <td className="px-4 py-2.5">
        <input
          type="date"
          value={startVal}
          onChange={(e) => setStartVal(e.target.value)}
          disabled={pending}
          aria-label="Start date"
          className={inputCls}
        />
      </td>
      <td className="px-4 py-2.5">
        {endIso === null ? (
          <input
            type="date"
            value={endVal}
            onChange={(e) => setEndVal(e.target.value)}
            disabled={pending}
            aria-label="End date (blank = ongoing)"
            className={inputCls}
          />
        ) : (
          <span className="tabular-nums text-fg-muted">{endIso}</span>
        )}
      </td>
      <td className="px-4 py-2.5 text-right">
        <div className="flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={save}
            disabled={pending || !dirty}
            className="rounded-md border border-border-strong bg-surface px-2 py-1 text-xs font-medium text-fg-muted transition-colors hover:bg-surface-2 hover:text-fg disabled:opacity-50"
          >
            {pending ? "Saving…" : "Save"}
          </button>
          {endIso !== null && (
            <button
              type="button"
              onClick={reopen}
              disabled={pending}
              className="ui-link-accent text-xs font-medium"
              title="Clear the end date (reopen as ongoing)"
            >
              Reopen
            </button>
          )}
          <DeleteAssignmentButton id={id} accountLabel={accountLabel} />
        </div>
      </td>
    </>
  );
}
