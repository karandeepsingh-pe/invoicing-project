"use client";

import {
  type ReactNode,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";

type DialogChildrenProps = { close: () => void };

export function Dialog({
  trigger,
  title,
  description,
  children,
  size = "md",
}: {
  trigger: ReactNode;
  title: string;
  description?: string;
  children: (api: DialogChildrenProps) => ReactNode;
  size?: "md" | "lg" | "xl";
}) {
  const [open, setOpen] = useState(false);
  const overlayRef = useRef<HTMLDivElement>(null);
  const headingId = useId();
  const descId = useId();

  const close = useCallback(() => setOpen(false), []);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") close();
    }
    document.addEventListener("keydown", onKey);
    // Lock background scroll while open.
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, close]);

  const widthClass =
    size === "xl"
      ? "max-w-3xl"
      : size === "lg"
        ? "max-w-2xl"
        : "max-w-lg";

  return (
    <>
      <span onClick={() => setOpen(true)} className="inline-flex">
        {trigger}
      </span>

      {open && (
        <div
          ref={overlayRef}
          onClick={(e) => {
            if (e.target === overlayRef.current) close();
          }}
          aria-modal="true"
          role="dialog"
          aria-labelledby={headingId}
          aria-describedby={description ? descId : undefined}
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-fg/30 px-4 py-12 backdrop-blur-sm"
        >
          <div
            className={`glass-strong w-full ${widthClass} rounded-2xl p-6 animate-fade-in`}
            onClick={(e) => e.stopPropagation()}
          >
            <header className="mb-4 flex items-start justify-between gap-4">
              <div className="flex flex-col gap-1">
                <h2 id={headingId} className="text-lg font-semibold tracking-tightish">
                  {title}
                </h2>
                {description && (
                  <p id={descId} className="text-xs text-fg-subtle">
                    {description}
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={close}
                aria-label="Close"
                className="rounded-md p-1 text-fg-subtle transition-colors hover:bg-surface/60 hover:text-fg"
              >
                <XIcon className="h-4 w-4" />
              </button>
            </header>
            <div>{children({ close })}</div>
          </div>
        </div>
      )}
    </>
  );
}

function XIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 20 20"
      fill="currentColor"
      className={className}
      aria-hidden="true"
    >
      <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
    </svg>
  );
}

export function AddButton({
  label,
  size = "sm",
}: {
  label: string;
  size?: "sm" | "md";
}) {
  const padding = size === "md" ? "px-3.5 py-2 text-sm" : "px-3 py-1.5 text-xs";
  return (
    <span
      className={
        "inline-flex cursor-pointer items-center gap-1.5 rounded-md bg-accent font-medium text-accent-fg shadow-sm transition-colors hover:bg-accent-hover " +
        padding
      }
    >
      <PlusIcon className="h-3.5 w-3.5" />
      {label}
    </span>
  );
}

function PlusIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 20 20"
      fill="currentColor"
      className={className}
      aria-hidden="true"
    >
      <path
        fillRule="evenodd"
        d="M10 5a.75.75 0 01.75.75v3.5h3.5a.75.75 0 010 1.5h-3.5v3.5a.75.75 0 01-1.5 0v-3.5h-3.5a.75.75 0 010-1.5h3.5v-3.5A.75.75 0 0110 5z"
        clipRule="evenodd"
      />
    </svg>
  );
}
