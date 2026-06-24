import Link from "next/link";

export type GenerateTab = "dedicated" | "dispatch" | "project" | "combined";

// In scroll mode (the combined view), the category tabs jump to their preview
// section instead of navigating to a separate single-category generate page.
const SCROLL_ANCHOR: Record<"dedicated" | "project" | "dispatch", string> = {
  dedicated: "#gen-dedicated",
  project: "#gen-project",
  dispatch: "#gen-dispatch",
};

/** Shared category tab strip for the invoice-generate pages. */
export function GenerateTypeTabs({
  accountId,
  active,
  year,
  month,
  variant = "navigate",
}: {
  accountId: string;
  active: GenerateTab;
  year: number;
  month: number;
  variant?: "navigate" | "scroll";
}) {
  const qs = `year=${year}&month=${month}`;

  if (variant === "scroll") {
    const scrollTabs: { key: keyof typeof SCROLL_ANCHOR; label: string }[] = [
      { key: "dedicated", label: "Dedicated FTE" },
      { key: "project", label: "Project / T&M" },
      { key: "dispatch", label: "Dispatch" },
    ];
    return (
      <nav className="sticky top-0 z-30 flex flex-wrap gap-1 border-b border-border bg-bg py-1">
        {scrollTabs.map((t) => (
          <a
            key={t.key}
            href={SCROLL_ANCHOR[t.key]}
            className="rounded-t-md px-3 py-2 text-sm font-medium text-fg-muted transition-colors hover:text-fg"
          >
            {t.label}
          </a>
        ))}
      </nav>
    );
  }

  const tabs: { key: GenerateTab; label: string; href: string }[] = [
    { key: "combined", label: "All categories", href: `/admin/invoices/generate/${accountId}/combined?${qs}` },
    { key: "dedicated", label: "Dedicated FTE", href: `/admin/invoices/generate/${accountId}?${qs}` },
    { key: "dispatch", label: "Dispatch", href: `/admin/invoices/generate/${accountId}/dispatch?${qs}` },
    { key: "project", label: "Project / T&M", href: `/admin/invoices/generate/${accountId}/project?${qs}` },
  ];
  return (
    <nav className="flex flex-wrap gap-1 border-b border-border">
      {tabs.map((t) => (
        <Link
          key={t.key}
          href={t.href as never}
          className={
            "rounded-t-md px-3 py-2 text-sm font-medium transition-colors " +
            (t.key === active
              ? "border-b-2 border-accent text-fg"
              : "text-fg-muted hover:text-fg")
          }
        >
          {t.label}
        </Link>
      ))}
    </nav>
  );
}

/** Shared Month/Year/Load picker for the invoice-generate pages. */
export function GenerateMonthPicker({ year, month }: { year: number; month: number }) {
  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  const years = [year - 1, year, year + 1];
  return (
    <form className="flex items-center gap-3 text-sm" method="get">
      <label className="flex items-center gap-2">
        <span className="text-fg-muted">Month</span>
        <select name="month" defaultValue={String(month)} className="glass-input rounded-md px-2 py-1">
          {months.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
        </select>
      </label>
      <label className="flex items-center gap-2">
        <span className="text-fg-muted">Year</span>
        <select name="year" defaultValue={String(year)} className="glass-input rounded-md px-2 py-1">
          {years.map((y) => <option key={y} value={y}>{y}</option>)}
        </select>
      </label>
      <button type="submit" className="rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-accent-fg hover:bg-accent-hover">
        Load
      </button>
    </form>
  );
}
