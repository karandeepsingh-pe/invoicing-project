"use client";

import { useActionState, useTransition } from "react";
import { deletePostalCode } from "@/lib/actions/postal-code";
import { ConfirmDialog } from "@/components/admin/confirm-dialog";
import { Dialog } from "@/components/admin/dialog";
import { useActionToast } from "@/lib/hooks/use-action-toast";
import { PostalCodeEditForm } from "./edit-form";

export function PostalCodeRowActions({
  id,
  zipcode,
  city,
  state,
  country,
  sortOrder,
}: {
  id: string;
  zipcode: string;
  city: string;
  state: string;
  country: string;
  sortOrder: number;
}) {
  const [deleteState, deleteAction] = useActionState(deletePostalCode, null);
  const [pending, startTransition] = useTransition();

  useActionToast(deleteState, {
    success: { title: `Deleted postal code "${zipcode}"` },
    error: { fallbackTitle: `Cannot delete "${zipcode}"` },
  });

  return (
    <div className="flex items-center justify-end gap-2">
      <Dialog
        trigger={
          <button
            type="button"
            className="rounded-md border border-border-strong bg-surface/60 px-2 py-1 text-xs font-medium text-fg-muted backdrop-blur transition-colors hover:bg-surface hover:text-fg"
          >
            Edit
          </button>
        }
        title={`Edit postal code "${zipcode}"`}
        description="Country drives the state options; state drives the city options."
        size="lg"
      >
        {({ close }) => (
          <PostalCodeEditForm
            id={id}
            zipcode={zipcode}
            city={city}
            state={state}
            country={country}
            sortOrder={sortOrder}
            onSuccess={close}
          />
        )}
      </Dialog>
      <ConfirmDialog
        trigger={
          <button
            type="button"
            disabled={pending}
            className="rounded-md border border-border-strong bg-surface/60 px-2 py-1 text-xs font-medium text-danger backdrop-blur transition-colors hover:bg-danger-bg disabled:opacity-50"
          >
            {pending ? "Deleting…" : "Delete"}
          </button>
        }
        title={`Delete postal code "${zipcode}"?`}
        body="Blocked if any technician still references this postal code."
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
