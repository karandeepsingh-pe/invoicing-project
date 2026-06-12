// Ovation brand lockup. The mark approximates the official geometric symbol
// (concentric open-circle form, rendered in Ovation Red) — swap the <svg> for
// the official asset when the vector file is available; the wordmark and
// layout stay.

export function OvationMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" fill="none" className={className} aria-hidden="true">
      {/* Outer broken ring */}
      <path
        d="M24 4a20 20 0 1 1-14.14 5.86"
        stroke="currentColor"
        strokeWidth="5"
        strokeLinecap="round"
      />
      {/* Inner counter-rotated arc */}
      <path
        d="M24 14a10 10 0 1 0 10 10"
        stroke="currentColor"
        strokeWidth="5"
        strokeLinecap="round"
      />
      {/* Core dot */}
      <circle cx="24" cy="24" r="3.5" fill="currentColor" />
    </svg>
  );
}

export function OvationLogo({
  withWordmark = true,
  markClassName = "h-8 w-8",
}: {
  withWordmark?: boolean;
  markClassName?: string;
}) {
  return (
    <span className="inline-flex items-center gap-3">
      <OvationMark className={`${markClassName} text-accent`} />
      {withWordmark && (
        <span className="flex flex-col leading-none">
          <span className="font-display text-base font-semibold tracking-[0.18em] text-fg">
            OVATION
          </span>
          <span className="mt-1 text-[7px] font-medium uppercase tracking-[0.34em] text-fg-subtle">
            Workplace Services
          </span>
        </span>
      )}
    </span>
  );
}
