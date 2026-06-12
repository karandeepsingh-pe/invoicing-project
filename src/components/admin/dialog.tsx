"use client";

import {
  type ReactNode,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";

type DialogChildrenProps = { close: () => void };
type DialogSize = "sm" | "md" | "lg" | "xl";

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
  size?: DialogSize;
}) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const overlayRef = useRef<HTMLDivElement>(null);
  const headingId = useId();
  const descId = useId();

  const close = useCallback(() => setOpen(false), []);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") close();
    }
    document.addEventListener("keydown", onKey);
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
        : size === "sm"
          ? "max-w-sm"
          : "max-w-lg";

  const paddingClass = size === "sm" ? "p-5" : "p-6";
  const headerMb = size === "sm" ? "mb-3" : "mb-4";

  const overlay = open ? (
    <div
      ref={overlayRef}
      onClick={(e) => {
        if (e.target === overlayRef.current) close();
      }}
      aria-modal="true"
      role="dialog"
      aria-labelledby={headingId}
      aria-describedby={description ? descId : undefined}
      className="fixed inset-0 z-[100] flex items-center justify-center overflow-y-auto bg-fg/40 px-4 py-8 backdrop-blur-sm animate-fade-in"
    >
      <div
        className={`glass-strong flex max-h-[calc(100vh-4rem)] w-full ${widthClass} flex-col rounded-2xl ${paddingClass} shadow-2xl animate-pop-in motion-reduce:animate-none`}
        onClick={(e) => e.stopPropagation()}
      >
        <header className={`${headerMb} flex flex-shrink-0 items-start justify-between gap-4`}>
          <div className="flex flex-col gap-1">
            <h2 id={headingId} className="text-base font-semibold tracking-tightish">
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
            className="-mr-1 -mt-1 rounded-md p-1 text-fg-subtle transition-colors hover:bg-surface/60 hover:text-fg"
          >
            <XIcon className="h-4 w-4" />
          </button>
        </header>
        {/* Body scrolls within the capped card height so tall forms never overflow
            the viewport (header + close button stay visible). */}
        <div className="-mx-1 flex-1 overflow-y-auto px-1">{children({ close })}</div>
      </div>
    </div>
  ) : null;

  return (
    <>
      <span onClick={() => setOpen(true)} className="inline-flex">
        {trigger}
      </span>
      {mounted && overlay ? createPortal(overlay, document.body) : null}
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
