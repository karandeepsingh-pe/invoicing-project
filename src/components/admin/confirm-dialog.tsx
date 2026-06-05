"use client";

import { type ReactNode, useState } from "react";
import { Dialog } from "./dialog";

export function ConfirmDialog({
  trigger,
  title,
  body,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  destructive = false,
  onConfirm,
}: {
  trigger: ReactNode;
  title: string;
  body?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  onConfirm: () => void | Promise<void>;
}) {
  const [busy, setBusy] = useState(false);

  return (
    <Dialog trigger={trigger} title={title} size="sm">
      {({ close }) => (
        <div className="flex flex-col gap-4">
          {body && <div className="text-sm leading-relaxed text-fg-muted">{body}</div>}
          <div className="flex items-center justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={close}
              disabled={busy}
              className="inline-flex items-center rounded-md border border-border-strong bg-surface/60 px-3.5 py-2 text-sm font-medium text-fg-muted transition-colors hover:bg-surface hover:text-fg disabled:opacity-50"
            >
              {cancelLabel}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  await onConfirm();
                  close();
                } finally {
                  setBusy(false);
                }
              }}
              className={
                "inline-flex items-center rounded-md px-3.5 py-2 text-sm font-medium shadow-sm transition-colors disabled:opacity-50 " +
                (destructive
                  ? "bg-danger text-white hover:bg-danger/90"
                  : "bg-accent text-accent-fg hover:bg-accent-hover")
              }
            >
              {busy ? "Working…" : confirmLabel}
            </button>
          </div>
        </div>
      )}
    </Dialog>
  );
}
