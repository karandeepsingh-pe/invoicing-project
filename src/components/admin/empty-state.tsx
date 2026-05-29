import { type ReactNode } from "react";

export function EmptyState({
  icon,
  title,
  body,
  cta,
  className,
}: {
  icon?: ReactNode;
  title: string;
  body?: string;
  cta?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={
        "glass-soft flex flex-col items-center gap-3 rounded-xl border-dashed p-10 text-center " +
        (className ?? "")
      }
    >
      {icon !== undefined ? icon : <DefaultIcon />}
      <div className="flex flex-col gap-1">
        <h3 className="text-base font-semibold tracking-tightish text-fg">{title}</h3>
        {body && <p className="max-w-sm text-sm text-fg-muted">{body}</p>}
      </div>
      {cta && <div className="mt-1">{cta}</div>}
    </div>
  );
}

function DefaultIcon() {
  return (
    <div className="flex h-12 w-12 items-center justify-center rounded-full bg-accent/10 text-accent">
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="h-6 w-6"
        aria-hidden="true"
      >
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
      </svg>
    </div>
  );
}
