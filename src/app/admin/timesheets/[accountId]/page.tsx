import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import { notDeleted } from "@/lib/domain/soft-delete";
import { monthRange, lastDayOfMonth } from "@/lib/invoice/period";
import { TimesheetGrid, type GridAssignment, type GridCell } from "./timesheet-grid";
import { DeleteMonthButton } from "./delete-month-button";
import { TimesheetTypeTabs } from "@/components/admin/timesheet-type-tabs";

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

  // Dedicated and Project/T&M are separate tabs, but share this one day-grid page
  // (same TimesheetEntry model + category-agnostic save). ?type switches which.
  const isProject = sp.type === "project";
  const rateCategory = isProject ? "PROJECT_TM" : "DEDICATED";
  const typeLabel = isProject ? "Project / T&M" : "Dedicated FTE";

  const account = await prisma.clientAccount.findUnique({
    where: { id: accountId },
    include: { org: true },
  });
  if (!account) notFound();

  const range = monthRange(year, month);
  const lastDay = lastDayOfMonth(year, month);

  const assignments = await prisma.assignment.findMany({
    where: {
      clientAccountId: accountId,
      rateCategory,
      startDate: { lt: range.end },
      OR: [{ endDate: null }, { endDate: { gte: range.start } }],
    },
    include: { technician: { include: { postalCode: true } } },
    orderBy: [
      { technician: { lastName: "asc" } },
      { technician: { firstName: "asc" } },
    ],
  });

  const entries = await prisma.timesheetEntry.findMany({
    where: {
      ...notDeleted,
      assignmentId: { in: assignments.map((a) => a.id) },
      date: { gte: range.start, lt: range.end },
    },
  });

  const cellsByAssignmentDate = new Map<string, GridCell>();
  for (const e of entries) {
    const key = `${e.assignmentId}|${fmtIso(e.date)}`;
    cellsByAssignmentDate.set(key, {
      hours: e.status ? null : Number(e.hours.toString()),
      status: e.status,
    });
  }

  const gridAssignments: GridAssignment[] = assignments.map((a) => ({
    assignmentId: a.id,
    technicianName: `${a.technician.firstName} ${a.technician.lastName}`,
    category: a.rateCategory === "PROJECT_TM" ? "PROJECT_TM" : "DEDICATED",
    contactNo: a.technician.phone ?? undefined,
    location: a.technician.postalCode
      ? `${a.technician.postalCode.city}, ${a.technician.postalCode.state}`
      : "—",
    band: a.technician.band,
    slaTier: a.slaTier,
  }));

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
          {typeLabel} timesheet
        </span>
        <h1 className="text-3xl font-semibold tracking-tighter2">
          {account.org.name} / {account.name} · {monthName} {year}
        </h1>
        <p className="text-sm text-fg-muted">
          Default Hours = {account.defaultHours}. Period {fmtIso(range.start)} →{" "}
          {fmtIso(lastDay)}.
        </p>

        <TimesheetTypeTabs accountId={accountId} year={year} month={month} active={rateCategory} />

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
              <strong><code>PH</code></strong> — Public Holiday. Reduces
              account-wide Business Days for the month.
            </li>
            <li>
              <strong><code>AB</code></strong> — Absent. On a <code>BACKFILL</code>
              -tier assignment, log a coverage event on the Backfill log.
            </li>
            <li>
              <strong><code>NA</code></strong> — Not Applicable / Terminated.
            </li>
          </ul>
        </details>
      </header>

      <MonthPicker accountId={accountId} year={year} month={month} isProject={isProject} />

      {env.SOFT_DELETE_ENABLED && gridAssignments.length > 0 && (
        <div className="flex justify-end">
          <DeleteMonthButton
            accountId={accountId}
            rateCategories={[rateCategory]}
            year={year}
            month={month}
            label={typeLabel}
          />
        </div>
      )}

      {gridAssignments.length === 0 ? (
        <div className="glass rounded-lg p-6 text-sm text-fg-muted">
          No {typeLabel} assignments overlap this month. Add a {typeLabel} assignment
          to a technician under this account, then return here.
        </div>
      ) : (
        <TimesheetGrid
          accountId={accountId}
          year={year}
          month={month}
          defaultHours={account.defaultHours}
          assignments={gridAssignments}
          days={days}
          initialCells={Object.fromEntries(cellsByAssignmentDate)}
          softDeleteEnabled={env.SOFT_DELETE_ENABLED}
        />
      )}
    </div>
  );
}

function MonthPicker({
  accountId,
  year,
  month,
  isProject,
}: {
  accountId: string;
  year: number;
  month: number;
  isProject: boolean;
}) {
  const months = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
  ];
  const years = [year - 1, year, year + 1];
  const qs = `year=${year}&month=${month}`;
  const generateHref = isProject
    ? `/admin/invoices/generate/${accountId}/project?${qs}`
    : `/admin/invoices/generate/${accountId}?${qs}`;
  return (
    <form className="flex flex-wrap items-center gap-3 text-sm" method="get">
      {isProject && <input type="hidden" name="type" value="project" />}
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
      {!isProject && (
        <Link
          href={`/admin/timesheets/${accountId}/coverage?${qs}`}
          className="ml-auto rounded-md border border-border-strong bg-surface px-3 py-1.5 text-sm font-medium text-fg hover:bg-surface-2"
        >
          Backfill log →
        </Link>
      )}
      <Link
        href={generateHref}
        className={`rounded-md border border-border-strong bg-surface px-3 py-1.5 text-sm font-medium text-fg hover:bg-surface-2 ${isProject ? "ml-auto" : ""}`}
      >
        Generate {isProject ? "Project" : "FTE"} →
      </Link>
      <Link
        href={`/admin/invoices/generate/${accountId}/combined?${qs}`}
        className="rounded-md border border-border-strong bg-surface px-3 py-1.5 text-sm font-medium text-fg hover:bg-surface-2"
      >
        Generate combined →
      </Link>
    </form>
  );
}
