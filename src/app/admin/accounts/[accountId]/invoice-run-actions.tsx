"use client";

import { useActionState, useTransition } from "react";
import { deleteInvoiceRun } from "@/lib/actions/invoice-run";
import { ConfirmDialog } from "@/components/admin/confirm-dialog";
import { useActionToast } from "@/lib/hooks/use-action-toast";

export function InvoiceRunDeleteButton({ id, label }: { id: string; label: string }) {
  const [state, action] = useActionState(deleteInvoiceRun, null);
  const [pending, startTransition] = useTransition();

  useActionToast(state, {
    success: { title: "Invoice run deleted" },
    error: { fallbackTitle: "Cannot delete run" },
  });

  return (
    <ConfirmDialog
      trigger={
        <button
          type="button"
          disabled={pending}
          className="rounded-md border border-border-strong bg-surface/60 px-2 py-1 text-xs font-medium text-danger transition-colors hover:bg-danger-bg disabled:opacity-50"
        >
          {pending ? "Deleting…" : "Delete"}
        </button>
      }
      title={`Delete invoice run — ${label}?`}
      body="Removes this generation record (no stored file is affected). Clear runs to free the account for deletion during testing."
      destructive
      confirmLabel="Delete run"
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
