"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { type Toast, useToast, type ToastVariant } from "./toast-provider";

const variantStyles: Record<ToastVariant, { ring: string; icon: string; iconColor: string }> = {
  success: {
    ring: "border-success/40",
    iconColor: "text-success",
    icon: "M5 10.75l3 3 7-7",
  },
  error: {
    ring: "border-danger/40",
    iconColor: "text-danger",
    icon: "M6 6l8 8M14 6l-8 8",
  },
  info: {
    ring: "border-accent/40",
    iconColor: "text-accent",
    icon: "M10 4.5v2M10 9.5v6",
  },
};

export function Toaster() {
  const { toasts, dismiss } = useToast();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted || toasts.length === 0) return null;

  return createPortal(
    <div
      aria-live="polite"
      className="pointer-events-none fixed right-4 top-4 z-[110] flex w-[calc(100vw-2rem)] max-w-sm flex-col gap-2"
    >
      {toasts.map((t) => (
        <ToastCard key={t.id} toast={t} onDismiss={() => dismiss(t.id)} />
      ))}
    </div>,
    document.body,
  );
}

function ToastCard({ toast, onDismiss }: { toast: Toast; onDismiss: () => void }) {
  const v = variantStyles[toast.variant];
  return (
    <div
      role="status"
      className={`glass-strong pointer-events-auto flex items-start gap-3 rounded-xl p-3 text-sm shadow-card-lg animate-fade-in ${v.ring}`}
    >
      <span
        className={`mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-surface/60 ${v.iconColor}`}
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 20 20"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="h-3.5 w-3.5"
          aria-hidden="true"
        >
          <path d={v.icon} />
        </svg>
      </span>
      <div className="flex flex-1 flex-col gap-0.5">
        <div className="font-medium leading-tight text-fg">{toast.title}</div>
        {toast.body && (
          <div className="text-xs leading-snug text-fg-muted">{toast.body}</div>
        )}
        {toast.action && (
          <button
            type="button"
            onClick={() => {
              toast.action!.onClick();
              onDismiss();
            }}
            className="mt-1.5 self-start ui-link-accent text-xs font-semibold"
          >
            {toast.action.label}
          </button>
        )}
      </div>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss"
        className="rounded p-0.5 text-fg-subtle transition-colors hover:bg-surface/60 hover:text-fg"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 20 20"
          fill="currentColor"
          className="h-3.5 w-3.5"
          aria-hidden="true"
        >
          <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
        </svg>
      </button>
    </div>
  );
}
