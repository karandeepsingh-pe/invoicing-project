"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  restoreTimesheetRowMonth,
  restoreTimesheetRowsMonth,
} from "@/lib/actions/soft-delete";
import { useToast } from "@/components/admin/toast-provider";
import type { ActionResult } from "@/lib/actions/result";

type DeletedRow = {
  assignmentId: string;
  technicianName: string;
  band: number;
  deletedDays: number;
};

export function DeletedRowsSection({
  year,
  month,
  rows,
}: {
  year: number;
  month: number;
  rows: DeletedRow[];
}) {
  const router = useRouter();
  const { push } = useToast();
  const [pending, start] = useTransition();
  const [busyId, setBusyId] = useState<string | null>(null);

  function finish(res: ActionResult) {
    setBusyId(null);
    if (res?.ok) {
      push({ variant: "success", title: "Restored", body: res.message });
      router.refresh();
    } else {
      push({
        variant: "error",
        title: "Restore failed",
        body: res?.formError ?? "Unknown error.",
      });
    }
  }

  function restoreOne(assignmentId: string) {
    setBusyId(assignmentId);
    start(async () => {
      const fd = new FormData();
      fd.append("assignmentId", assignmentId);
      fd.append("year", String(year));
      fd.append("month", String(month));
      finish(await restoreTimesheetRowMonth(null, fd));
    });
  }

  function restoreAll() {
    setBusyId("__all__");
    start(async () => {
      const fd = new FormData();
      for (const r of rows) fd.append("assignmentIds", r.assignmentId);
      fd.append("year", String(year));
      fd.append("month", String(month));
      finish(await restoreTimesheetRowsMonth(null, fd));
    });
  }

  return (
    <section className="glass overflow-hidden rounded-lg border border-warning/30">
      <div className="flex items-center justify-between border-b border-border bg-surface-2 px-4 py-2.5">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold tracking-tight">Deleted this month</span>
          <span className="rounded-full bg-surface px-2 py-0.5 text-xs font-medium text-fg-muted">
            {rows.length}
          </span>
        </div>
        <button
          type="button"
          disabled={pending}
          onClick={restoreAll}
          className="rounded-md border border-border-strong bg-surface px-3 py-1.5 text-xs font-medium text-fg hover:bg-surface-2 disabled:opacity-50"
        >
          {busyId === "__all__" ? "Restoring…" : "Restore all"}
        </button>
      </div>
      <p className="px-4 pt-2 text-xs text-fg-subtle">
        These technicians&apos; entries for this month were soft-deleted (recoverable). Only this
        month is affected. Restore brings the saved days back into the grid above.
      </p>
      <ul className="divide-y divide-border/60">
        {rows.map((r) => (
          <li
            key={r.assignmentId}
            className="flex items-center justify-between px-4 py-2.5 text-sm"
          >
            <div className="min-w-0">
              <span className="font-medium text-fg">{r.technicianName}</span>
              <span className="ml-2 text-xs text-fg-subtle">
                Band {r.band} · {r.deletedDays} day{r.deletedDays === 1 ? "" : "s"} deleted
              </span>
            </div>
            <button
              type="button"
              disabled={pending}
              onClick={() => restoreOne(r.assignmentId)}
              className="rounded-md border border-accent/40 bg-surface px-3 py-1.5 text-xs font-medium text-accent hover:bg-surface-2 disabled:opacity-50"
            >
              {busyId === r.assignmentId ? "Restoring…" : "Restore"}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
