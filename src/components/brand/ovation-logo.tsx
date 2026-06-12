// Official Ovation brand assets (from "Ovation logo (HR).jpg", processed to
// transparent PNGs): /ovation-mark.png (symbol) and /ovation-logo.png (full
// stacked lockup). Brand rules allow the full-color logo on white or black,
// so the red mark renders as-is in both themes.

import Image from "next/image";

/**
 * Horizontal lockup for chrome (sidebar, app bar): the official mark beside a
 * crisp text wordmark — raster type would blur at this size.
 */
export function OvationLogo({
  withWordmark = true,
  markClassName = "h-9 w-9",
}: {
  withWordmark?: boolean;
  markClassName?: string;
}) {
  return (
    <span className="inline-flex items-center gap-3">
      <Image
        src="/ovation-mark.png"
        alt="Ovation"
        width={48}
        height={48}
        className={markClassName}
        priority
      />
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

/** Full official stacked lockup (mark + wordmark) for large placements. */
export function OvationLockup({ width = 220 }: { width?: number }) {
  return (
    <Image
      src="/ovation-logo.png"
      alt="Ovation Workplace Services"
      width={width}
      height={Math.round(width * 0.7225)}
      priority
    />
  );
}
