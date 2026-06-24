"use client";

import { useActionState, useTransition } from "react";
import type { ReactNode } from "react";
import { deleteOrg } from "@/lib/actions/org";
import { deleteClientAccount } from "@/lib/actions/client-account";
import { deleteTechnician } from "@/lib/actions/technician";
import { ConfirmDialog } from "@/components/admin/confirm-dialog";
import { useActionToast } from "@/lib/hooks/use-action-toast";
import type { ActionResult } from "@/lib/actions/result";

const baseButton =
  "inline-flex items-center rounded-md border border-border-strong bg-surface/60 px-2 py-1 text-xs font-medium text-danger transition-colors hover:bg-danger-bg disabled:opacity-50";

function GuardedDelete({
  id,
  noun,
  label,
  body,
  action,
}: {
  id: string;
  noun: string;
  label: string;
  body: ReactNode;
  action: (prev: ActionResult, fd: FormData) => Promise<ActionResult>;
}) {
  const [state, dispatch] = useActionState(action, null);
  const [pending, startTransition] = useTransition();

  useActionToast(state, {
    success: { title: `Deleted ${noun} "${label}"` },
    error: { fallbackTitle: `Cannot delete ${noun} "${label}"` },
  });

  return (
    <ConfirmDialog
      trigger={
        <button type="button" disabled={pending} className={baseButton}>
          {pending ? "Deleting…" : "Delete"}
        </button>
      }
      title={`Delete ${noun} "${label}"?`}
      body={body}
      destructive
      confirmLabel="Delete"
      onConfirm={() => {
        startTransition(() => {
          const fd = new FormData();
          fd.append("id", id);
          dispatch(fd);
        });
      }}
    />
  );
}

export function DeleteOrgButton({ id, name }: { id: string; name: string }) {
  return (
    <GuardedDelete
      id={id}
      noun="client"
      label={name}
      body="Blocked if it still has any accounts or technicians."
      action={deleteOrg}
    />
  );
}

export function DeleteAccountButton({ id, name }: { id: string; name: string }) {
  return (
    <GuardedDelete
      id={id}
      noun="account"
      label={name}
      body="Cascades rate rows, misc fees, and SDM access. Blocked if it has assignments or invoice runs."
      action={deleteClientAccount}
    />
  );
}

export function DeleteTechnicianButton({
  id,
  firstName,
  lastName,
}: {
  id: string;
  firstName: string;
  lastName: string;
}) {
  return (
    <GuardedDelete
      id={id}
      noun="technician"
      label={`${firstName} ${lastName}`}
      body="Blocked if the technician still has any assignments. End them first."
      action={deleteTechnician}
    />
  );
}
