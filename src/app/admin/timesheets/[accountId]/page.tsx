import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import { monthRange, lastDayOfMonth } from "@/lib/invoice/period";
import { TimesheetCategorySection } from "./category-section";
import { DispatchCategorySection } from "./dispatch-section";
import { DownloadTimesheetButton } from "./download-timesheet-button";
import { TimesheetTypeTabs } from "@/components/admin/timesheet-type-tabs";

type View = "all" | "dedicated" | "project" | "scheduled";
const DAY_CATEGORY = {
  dedicated: "DEDICATED",
  project: "PROJECT_TM",
  scheduled: "SCHEDULED",
} as const;

function fmtIso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export default async function TimesheetPage({
  params,
  searchParams,
}: {
  params: Promise<{ accountId: string }>;
  searchParams: Promise<{ year?: string; month?: string; type?: string }>;
}) {
  const { accountId } = await params;
  const sp = await searchParams;

  const now = new Date();
  const year = sp.year ? Number(sp.year) : now.getUTCFullYear();
  const month = sp.month ? Number(sp.month) : now.getUTCMonth() + 1;

  // No ?type -> the combined "All categories" view (load every category for the
  // month at once). The single-category tabs stay for focused editing.
  const view: View =
    sp.type === "project"
      ? "project"
      : sp.type === "scheduled"
        ? "scheduled"
        : sp.type === "dedicated"
          ? "dedicated"
          : "all";

  const account = await prisma.clientAccount.findUnique({
    where: { id: accountId },
    include: { org: true },
  });
  if (!account) notFound();

  const range = monthRange(year, month);
  const lastDay = lastDayOfMonth(year, month);

  // Gazetted holidays for the month (global list); same for every category.
  const holidays = await prisma.holiday.findMany({
    where: { date: { gte: range.start, lt: range.end } },
    orderBy: { date: "asc" },
  });
  const holidayDates = holidays.map((h) => fmtIso(h.date));

  const days: string[] = [];
  for (
    let d = new Date(range.start.getTime());
    d.getTime() < range.end.getTime();
    d.setUTCDate(d.getUTCDate() + 1)
  ) {
    days.push(fmtIso(d));
  }

  const monthName = range.start.toLocaleString("en-US", {
    month: "long",
    timeZone: "UTC",
  });

  const activeTab =
    view === "all"
      ? "ALL"
      : view === "project"
        ? "PROJECT_TM"
        : view === "scheduled"
          ? "SCHEDULED"
          : "DEDICATED";

  const sectionProps = {
    accountId,
    year,
    month,
    defaultHours: account.defaultHours,
    softDeleteEnabled: env.SOFT_DELETE_ENABLED,
    holidayDates,
    days,
  } as const;

  return (
    <div className="flex flex-col gap-6 animate-fade-in">
      <header className="flex flex-col gap-1.5">
        <Link
          href="/admin/timesheets"
          className="text-xs font-medium text-fg-subtle hover:text-fg"
        >
          ← Timesheets
        </Link>
        <span className="text-[11px] font-semibold uppercase tracking-wider text-accent">
          {view === "all" ? "All categories" : "Timesheet"}
        </span>
        <h1 className="text-3xl font-semibold tracking-tighter2">
          {account.org.name} / {account.name} · {monthName} {year}
        </h1>
        <p className="text-sm text-fg-muted">
          Default Hours = {account.defaultHours}. Period {fmtIso(range.start)} →{" "}
          {fmtIso(lastDay)}. Cells autosave as you type.
        </p>

        <TimesheetTypeTabs
          accountId={accountId}
          year={year}
          month={month}
          active={activeTab}
          variant={view === "all" ? "scroll" : "navigate"}
        />

        <details className="glass-soft rounded-md p-3 text-xs text-fg-muted">
          <summary className="cursor-pointer font-semibold text-fg">
            Codes &amp; rules — what to enter
          </summary>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>
              <strong>Number</strong> (e.g. <code>8</code>, <code>10</code>) —
              hours worked. Weekday hours up to Default Hours count as regular
              time; anything above is OT.
            </li>
            <li>
              <strong>Sat / Sun number</strong> — any value goes into the
              separate Weekend Hours bucket (no day count, no OT).
            </li>
            <li>
              <strong><code>PH</code></strong> — Public Holiday. Bills to the
              client as a full paid day. (<code>PTO</code> is paid to the
              technician but <strong>not billed</strong>.)
            </li>
            <li>
              <strong><code>AB</code></strong> — Absent. On a <code>BACKFILL</code>
              -tier assignment, log a coverage event on the Backfill log.
            </li>
            <li>
              <strong><code>NA</code></strong> — Not Applicable / Terminated.
            </li>
            <li>
              <strong>Dedicated</strong> weekdays pre-fill Default Hours and save
              automatically; <strong>Project</strong> and <strong>Scheduled</strong>{" "}
              start blank (enter only the days worked).
            </li>
          </ul>
        </details>
      </header>

      <TimesheetActionBar
        accountId={accountId}
        year={year}
        month={month}
        view={view}
      />

      {holidays.length > 0 && (
        <div className="glass-soft rounded-md px-3 py-2 text-xs text-fg-muted">
          <span className="font-semibold text-fg">Holidays this month:</span>{" "}
          {holidays.map((h) => `${fmtIso(h.date)} ${h.name}`).join(" · ")}
          {" — pre-filled as PH (a billed paid day) on Dedicated; type hours over a cell if someone works that day."}
        </div>
      )}

      {view === "all" ? (
        <div className="flex flex-col gap-10">
          <TimesheetCategorySection
            {...sectionProps}
            rateCategory="DEDICATED"
            headingId="sec-dedicated"
            stickyHeading={false}
          />
          <TimesheetCategorySection
            {...sectionProps}
            rateCategory="PROJECT_TM"
            headingId="sec-project"
            stickyHeading={false}
          />
          <TimesheetCategorySection
            {...sectionProps}
            rateCategory="SCHEDULED"
            headingId="sec-scheduled"
            stickyHeading={false}
          />
          <DispatchCategorySection
            accountId={accountId}
            year={year}
            month={month}
            softDeleteEnabled={env.SOFT_DELETE_ENABLED}
            headingId="sec-dispatch"
            stickyHeading={false}
          />
        </div>
      ) : (
        <TimesheetCategorySection
          {...sectionProps}
          rateCategory={DAY_CATEGORY[view]}
          showEditLink={false}
        />
      )}
    </div>
  );
}

function TimesheetActionBar({
  accountId,
  year,
  month,
  view,
}: {
  accountId: string;
  year: number;
  month: number;
  view: View;
}) {
  const months = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
  ];
  const years = [year - 1, year, year + 1];
  const qs = `year=${year}&month=${month}`;
  const linkCls =
    "rounded-md border border-border-strong bg-surface px-3 py-1.5 text-sm font-medium text-fg hover:bg-surface-2";

  return (
    <div className="flex flex-col gap-3">
      <form className="flex flex-wrap items-center gap-3 text-sm" method="get">
        {view !== "all" && <input type="hidden" name="type" value={view} />}
        <label className="flex items-center gap-2">
          <span className="text-fg-muted">Month</span>
          <select name="month" defaultValue={String(month)} className="glass-input rounded-md px-2 py-1">
            {months.map((m, i) => (
              <option key={m} value={i + 1}>{m}</option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-2">
          <span className="text-fg-muted">Year</span>
          <select name="year" defaultValue={String(year)} className="glass-input rounded-md px-2 py-1">
            {years.map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
        </label>
        <button
          type="submit"
          className="rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-accent-fg hover:bg-accent-hover"
        >
          Load
        </button>

        <DownloadTimesheetButton accountId={accountId} year={year} month={month} />

        {view === "dedicated" && (
          <>
            <Link href={`/admin/timesheets/${accountId}/coverage?${qs}`} className={`ml-auto ${linkCls}`}>
              Backfill log →
            </Link>
            <Link href={`/admin/invoices/generate/${accountId}?${qs}`} className={linkCls}>
              Generate FTE →
            </Link>
          </>
        )}
        {view === "project" && (
          <Link href={`/admin/invoices/generate/${accountId}/project?${qs}`} className={`ml-auto ${linkCls}`}>
            Generate Project →
          </Link>
        )}
        {view === "all" && (
          <Link href={`/admin/timesheets/${accountId}/coverage?${qs}`} className={`ml-auto ${linkCls}`}>
            Backfill log →
          </Link>
        )}
        <Link
          href={`/admin/invoices/generate/${accountId}/combined?${qs}`}
          className={`${view === "scheduled" ? "ml-auto " : ""}${linkCls}`}
        >
          Generate combined →
        </Link>
      </form>
    </div>
  );
}
