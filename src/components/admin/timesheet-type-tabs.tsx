import Link from "next/link";

/** Dedicated | Project | Dispatch tab strip, shared by the timesheet + dispatch pages. */
export function TimesheetTypeTabs({
  accountId,
  year,
  month,
  active,
}: {
  accountId: string;
  year: number;
  month: number;
  active: "DEDICATED" | "PROJECT_TM" | "DISPATCH";
}) {
  const qs = `year=${year}&month=${month}`;
  const tabs: { key: string; label: string; href: string }[] = [
    { key: "DEDICATED", label: "Dedicated FTE", href: `/admin/timesheets/${accountId}?${qs}` },
    { key: "PROJECT_TM", label: "Project / T&M", href: `/admin/timesheets/${accountId}?${qs}&type=project` },
    { key: "DISPATCH", label: "Dispatch / Scheduled Visit", href: `/admin/dispatch-visits/${accountId}?${qs}` },
  ];
  return (
    <div className="mt-1 flex flex-wrap gap-1.5 text-xs">
      {tabs.map((t) => (
        <Link
          key={t.key}
          href={t.href}
          className={
            "rounded-md px-2.5 py-1 font-medium transition-colors " +
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
