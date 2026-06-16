"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { deleteAssignments } from "@/lib/actions/assignment";
import { ConfirmDialog } from "@/components/admin/confirm-dialog";
import { useToast } from "@/components/admin/toast-provider";
import { AssignmentDatesEditor } from "./assignment-dates-editor";

export type AssignmentRow = {
  id: string;
  techId: string;
  techName: string;
  band: number;
  categoryLabel: string;
  startIso: string;
  endIso: string | null;
};

export function AssignmentsTable({
  rows,
  accountLabel,
}: {
  rows: AssignmentRow[];
  accountLabel: string;
}) {
  const router = useRouter();
  const { push } = useToast();
  const [pending, start] = useTransition();
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const allSelected = rows.length > 0 && selectedIds.size === rows.length;

  function toggle(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    setSelectedIds((prev) =>
      prev.size === rows.length ? new Set() : new Set(rows.map((r) => r.id)),
    );
  }

  function handleBulkDelete() {
    return new Promise<void>((resolve) => {
      start(async () => {
        const fd = new FormData();
        for (const id of selectedIds) fd.append("ids", id);
        const res = await deleteAssignments(null, fd);
        if (res?.ok) {
          push({ variant: "success", title: "Assignments deleted", body: res.message });
          setSelectedIds(new Set());
          router.refresh();
        } else {
          push({
            variant: "error",
            title: "Failed to delete",
            body: res?.formError ?? "Unknown error.",
          });
        }
        resolve();
      });
    });
  }

  return (
    <div className="flex flex-col gap-2">
      {selectedIds.size > 0 && (
        <div className="flex items-center justify-between rounded-md border border-border-strong bg-surface px-3 py-2 text-sm">
          <span className="font-medium text-fg">
            {selectedIds.size} selected
          </span>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setSelectedIds(new Set())}
              className="text-xs font-medium text-fg-subtle hover:text-fg"
            >
              Clear
            </button>
            <ConfirmDialog
              trigger={
                <button
                  type="button"
                  disabled={pending}
                  className="rounded-md border border-danger/40 bg-surface px-3 py-1.5 text-sm font-medium text-danger hover:bg-danger-bg disabled:opacity-50"
                >
                  {pending ? "Deleting…" : `Delete selected (${selectedIds.size})`}
                </button>
              }
              title={`Delete ${selectedIds.size} assignment${selectedIds.size === 1 ? "" : "s"}?`}
              body={
                <span>
                  Permanently removes the selected assignment records from{" "}
                  <span className="font-semibold">{accountLabel}</span>. All-or-nothing:
                  if any still has live timesheet entries, none are deleted and you will
                  see which to clear first.
                </span>
              }
              destructive
              confirmLabel="Delete selected"
              onConfirm={handleBulkDelete}
            />
          </div>
        </div>
      )}

      <div className="glass overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-surface-2 text-xs uppercase tracking-wider text-fg-muted">
            <tr>
              <th className="px-4 py-2.5 text-left font-medium">
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={toggleAll}
                  disabled={rows.length === 0}
                  aria-label="Select all assignments"
                  className="h-4 w-4 rounded border-border-strong text-accent accent-accent focus:ring-accent"
                />
              </th>
              <th className="px-4 py-2.5 text-left font-medium">Technician</th>
              <th className="px-4 py-2.5 text-left font-medium">Band</th>
              <th className="px-4 py-2.5 text-left font-medium">Category</th>
              <th className="px-4 py-2.5 text-left font-medium">Start</th>
              <th className="px-4 py-2.5 text-left font-medium">End</th>
              <th className="px-4 py-2.5"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr
                key={r.id}
                className={`border-t border-border transition-colors hover:bg-surface-2 ${
                  selectedIds.has(r.id) ? "bg-surface-2" : ""
                }`}
              >
                <td className="px-4 py-2.5">
                  <input
                    type="checkbox"
                    checked={selectedIds.has(r.id)}
                    onChange={() => toggle(r.id)}
                    aria-label={`Select ${r.techName}`}
                    className="h-4 w-4 rounded border-border-strong text-accent accent-accent focus:ring-accent"
                  />
                </td>
                <td className="px-4 py-2.5">
                  <Link
                    className="ui-link font-medium text-fg"
                    href={`/admin/technicians/${r.techId}` as never}
                  >
                    {r.techName}
                  </Link>
                </td>
                <td className="px-4 py-2.5 text-fg-muted">Band {r.band}</td>
                <td className="px-4 py-2.5 text-fg-muted">{r.categoryLabel}</td>
                <AssignmentDatesEditor
                  id={r.id}
                  startIso={r.startIso}
                  endIso={r.endIso}
                  accountLabel={accountLabel}
                />
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-4 text-sm text-fg-subtle">
                  No assignments to this account yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
