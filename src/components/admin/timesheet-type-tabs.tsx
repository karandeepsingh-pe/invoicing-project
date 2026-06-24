import Link from "next/link";

type TabKey = "ALL" | "DEDICATED" | "PROJECT_TM" | "SCHEDULED" | "DISPATCH";

// In scroll mode, the day-grid categories + dispatch jump to their section on the
// combined all-view instead of navigating to a separate single-category page.
const SCROLL_ANCHOR: Partial<Record<TabKey, string>> = {
  DEDICATED: "#sec-dedicated",
  PROJECT_TM: "#sec-project",
  SCHEDULED: "#sec-scheduled",
  DISPATCH: "#sec-dispatch",
};

const pillBase = "rounded-md px-2.5 py-1 font-medium transition-colors";

/**
 * Dedicated | Project | Scheduled | Dispatch tab strip.
 * - `variant="navigate"` (default): each tab is a Link to its page.
 * - `variant="scroll"`: tabs are in-page anchors that scroll to the matching
 *   section on the combined all-view (so switching category never reloads).
 */
export function TimesheetTypeTabs({
  accountId,
  year,
  month,
  active,
  variant = "navigate",
}: {
  accountId: string;
  year: number;
  month: number;
  active: TabKey;
  variant?: "navigate" | "scroll";
}) {
  const qs = `year=${year}&month=${month}`;

  if (variant === "scroll") {
    const scrollTabs: { key: TabKey; label: string }[] = [
      { key: "DEDICATED", label: "Dedicated FTE" },
      { key: "PROJECT_TM", label: "Project / T&M" },
      { key: "SCHEDULED", label: "Scheduled Visit" },
      { key: "DISPATCH", label: "Dispatch" },
    ];
    return (
      <div className="sticky top-0 z-30 -mx-1 flex flex-wrap gap-1.5 bg-bg px-1 py-2 text-xs">
        {scrollTabs.map((t) => (
          <a
            key={t.key}
            href={SCROLL_ANCHOR[t.key]}
            className={`${pillBase} border border-border-strong bg-surface text-fg-muted hover:bg-surface-2 hover:text-fg`}
          >
            {t.label}
          </a>
        ))}
      </div>
    );
  }

  const tabs: { key: TabKey; label: string; href: string }[] = [
    { key: "ALL", label: "All categories", href: `/admin/timesheets/${accountId}?${qs}` },
    { key: "DEDICATED", label: "Dedicated FTE", href: `/admin/timesheets/${accountId}?${qs}&type=dedicated` },
    { key: "PROJECT_TM", label: "Project / T&M", href: `/admin/timesheets/${accountId}?${qs}&type=project` },
    { key: "SCHEDULED", label: "Scheduled Visit", href: `/admin/timesheets/${accountId}?${qs}&type=scheduled` },
    { key: "DISPATCH", label: "Dispatch", href: `/admin/dispatch-visits/${accountId}?${qs}` },
  ];
  return (
    <div className="mt-1 flex flex-wrap gap-1.5 text-xs">
      {tabs.map((t) => (
        <Link
          key={t.key}
          href={t.href}
          className={
            pillBase +
            " " +
            (t.key === active
              ? "bg-accent text-accent-fg"
              : "border border-border-strong bg-surface text-fg-muted hover:bg-surface-2")
          }
        >
          {t.label}
        </Link>
      ))}
    </div>
  );
}
