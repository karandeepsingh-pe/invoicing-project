"use client";

import { useTransition } from "react";
import { deleteAssignment } from "@/lib/actions/assignment";
import { ConfirmDialog } from "@/components/admin/confirm-dialog";
import { useToast } from "@/components/admin/toast-provider";

export function DeleteAssignmentButton({
  id,
  accountLabel,
}: {
  id: string;
  accountLabel: string;
}) {
  const [pending, start] = useTransition();
  const { push } = useToast();

  return (
    <ConfirmDialog
      trigger={
        <button
          type="button"
          disabled={pending}
          className="text-xs font-medium text-danger hover:underline disabled:opacity-50"
        >
          Delete
        </button>
      }
      title={`Delete assignment to "${accountLabel}"?`}
      body={
        <>
          Permanently removes this assignment record. Blocked if it has any timesheet entries.
          Use <span className="font-semibold">End</span> instead if you only want to close it out.
        </>
      }
      confirmLabel="Delete"
      destructive
      onConfirm={() =>
        new Promise<void>((resolve) => {
          start(async () => {
            const fd = new FormData();
            fd.set("id", id);
            const res = await deleteAssignment(null, fd);
            if (res?.ok) {
              push({ variant: "success", title: "Assignment deleted" });
            } else {
              push({
                variant: "error",
                title: "Failed to delete",
                body: res?.formError ?? "Unknown error.",
              });
            }
            resolve();
          });
        })
      }
    />
  );
}
