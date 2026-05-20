"use client";

import { useActionState } from "react";
import { deleteOrg } from "@/lib/actions/org";
import { deleteClientAccount } from "@/lib/actions/client-account";
import { deleteTechnician } from "@/lib/actions/technician";

type DeleteFormProps = {
  id: string;
  label: string;
  noun: string;
};

const baseButton =
  "inline-flex items-center rounded-md border border-border-strong bg-surface px-2 py-1 text-xs font-medium text-danger transition-colors hover:bg-danger-bg disabled:opacity-50";

function ConfirmDeleteForm({
  id,
  label,
  noun,
  action,
}: DeleteFormProps & {
  action: (prev: import("@/lib/actions/result").ActionResult, fd: FormData) => Promise<import("@/lib/actions/result").ActionResult>;
}) {
  const [state, dispatch, pending] = useActionState(action, null);
  const error = state && state.ok === false ? state.formError : undefined;

  return (
    <div className="flex flex-col items-end gap-1">
      <form
        action={dispatch}
        onSubmit={(e) => {
          if (!confirm(`Delete ${noun} "${label}"? This cannot be undone.`)) {
            e.preventDefault();
          }
        }}
      >
        <input type="hidden" name="id" value={id} />
        <button type="submit" disabled={pending} className={baseButton}>
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

export function DeleteOrgButton({ id, name }: { id: string; name: string }) {
  return <ConfirmDeleteForm id={id} label={name} noun="org" action={deleteOrg} />;
}

export function DeleteAccountButton({ id, name }: { id: string; name: string }) {
  return <ConfirmDeleteForm id={id} label={name} noun="client account" action={deleteClientAccount} />;
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
    <ConfirmDeleteForm
      id={id}
      label={`${firstName} ${lastName}`}
      noun="technician"
      action={deleteTechnician}
    />
  );
}
