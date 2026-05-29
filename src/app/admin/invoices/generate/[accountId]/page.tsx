import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import {
  businessDaysInRange,
  lastDayOfMonth,
  monthRange,
} from "@/lib/invoice/period";
import { splitEntries } from "@/lib/invoice/hours-split";
import { GenerateForm, type AssignmentPreview } from "./generate-form";

export default async function GeneratePreInvoicePage({
  params,
  searchParams,
}: {
  params: Promise<{ accountId: string }>;
  searchParams: Promise<{ year?: string; month?: string }>;
}) {
  const { accountId } = await params;
  const sp = await searchParams;

  const now = new Date();
  const defaultYear = now.getUTCFullYear();
  const defaultMonth = now.getUTCMonth() + 1;
  const year = sp.year ? Number(sp.year) : defaultYear;
  const month = sp.month ? Number(sp.month) : defaultMonth;

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
      rateCategory: "DEDICATED",
      startDate: { lt: range.end },
      OR: [{ endDate: null }, { endDate: { gte: range.start } }],
    },
    include: {
      technician: { include: { postalCode: true } },
      timesheetEntries: { where: { date: { gte: range.start, lt: range.end } } },
    },
    orderBy: [
      { technician: { lastName: "asc" } },
      { technician: { firstName: "asc" } },
    ],
  });

  const phDateSet = new Set<string>();
  for (const a of assignments) {
    for (const e of a.timesheetEntries) {
      if (e.status === "PH") phDateSet.add(e.date.toISOString().slice(0, 10));
    }
  }
  const phDates = Array.from(phDateSet).map(
    (iso) => new Date(`${iso}T00:00:00.000Z`),
  );
  const businessDays = businessDaysInRange(range, phDates);

  const defaultHours = account.defaultHours;

  const previews: AssignmentPreview[] = assignments.map((a) => {
    const split = splitEntries(
      a.timesheetEntries.map((e) => ({
        date: e.date,
        hours: e.hours,
        status: e.status,
      })),
      defaultHours,
    );
    return {
      assignmentId: a.id,
      technicianName: `${a.technician.firstName} ${a.technician.lastName}`,
      band: a.technician.band,
      backfillLabel:
        a.slaTier === "BACKFILL"
          ? "Backfill"
          : a.slaTier === "NO_BACKFILL"
            ? "No Backfill"
            : "",
      daysWorked: Number(split.regularDays.toFixed(2)),
      otHours: Number(split.otHours.toFixed(2)),
      weekendHours: Number(split.weekendHours.toFixed(2)),
    };
  });

  const monthName = range.start.toLocaleString("en-US", {
    month: "long",
    timeZone: "UTC",
  });

  return (
    <div className="flex flex-col gap-6 animate-fade-in">
      <header className="flex flex-col gap-1.5">
        <Link
          href="/admin/invoices"
          className="text-xs font-medium text-fg-subtle hover:text-fg"
        >
          ← Invoices
        </Link>
        <span className="text-[11px] font-semibold uppercase tracking-wider text-accent">
          Generate pre-invoice
        </span>
        <h1 className="text-3xl font-semibold tracking-tighter2">
          {account.org.name} / {account.name} · {monthName} {year}
        </h1>
        <p className="text-sm text-fg-muted">
          Period {range.start.toISOString().slice(0, 10)} → {lastDay.toISOString().slice(0, 10)}.
          Business days: <span className="font-semibold text-fg">{businessDays}</span>{" "}
          (auto: weekdays minus PH dates from timesheet).
        </p>
        <div className="flex gap-3 text-xs">
          <Link
            href={`/admin/timesheets/${accountId}?year=${year}&month=${month}`}
            className="text-accent hover:text-accent-hover"
          >
            Open timesheet →
          </Link>
        </div>
      </header>

      <TypeTabs accountId={accountId} active="dedicated" year={year} month={month} />

      <MonthPicker year={year} month={month} />

      {previews.length === 0 ? (
        <div className="glass rounded-lg p-6 text-sm text-fg-muted">
          No DEDICATED assignments overlap this month.
        </div>
      ) : (
        <GenerateForm
          accountId={accountId}
          year={year}
          month={month}
          businessDays={businessDays}
          assignments={previews}
        />
      )}
    </div>
  );
}

function TypeTabs({
  accountId,
  active,
  year,
  month,
}: {
  accountId: string;
  active: "dedicated" | "dispatch" | "project";
  year: number;
  month: number;
}) {
  const tabs: { key: typeof active; label: string; href: string }[] = [
    {
      key: "dedicated",
      label: "Dedicated FTE",
      href: `/admin/invoices/generate/${accountId}?year=${year}&month=${month}`,
    },
    {
      key: "dispatch",
      label: "Dispatch",
      href: `/admin/invoices/generate/${accountId}/dispatch?year=${year}&month=${month}`,
    },
    {
      key: "project",
      label: "Project / T&M",
      href: `/admin/invoices/generate/${accountId}/project?year=${year}&month=${month}`,
    },
  ];
  return (
    <nav className="flex gap-1 border-b border-border">
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

function MonthPicker({ year, month }: { year: number; month: number }) {
  const months = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];
  const years = [year - 1, year, year + 1];
  return (
    <form className="flex items-center gap-3 text-sm" method="get">
      <label className="flex items-center gap-2">
        <span className="text-fg-muted">Month</span>
        <select
          name="month"
          defaultValue={String(month)}
          className="glass-input rounded-md px-2 py-1"
        >
          {months.map((m, i) => (
            <option key={m} value={i + 1}>
              {m}
            </option>
          ))}
        </select>
      </label>
      <label className="flex items-center gap-2">
        <span className="text-fg-muted">Year</span>
        <select
          name="year"
          defaultValue={String(year)}
          className="glass-input rounded-md px-2 py-1"
        >
          {years.map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </select>
      </label>
      <button
        type="submit"
        className="rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-accent-fg hover:bg-accent-hover"
      >
        Load
      </button>
    </form>
  );
}
