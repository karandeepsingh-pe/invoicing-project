import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { monthRange, lastDayOfMonth } from "@/lib/invoice/period";
import { computeDaysWorked } from "@/lib/invoice/dedicated-fte-calculator";
import { ProjectGenerateForm } from "./generate-form";

export default async function GenerateProjectPage({
  params,
  searchParams,
}: {
  params: Promise<{ accountId: string }>;
  searchParams: Promise<{ year?: string; month?: string }>;
}) {
  const { accountId } = await params;
  const sp = await searchParams;
  const now = new Date();
  const year = sp.year ? Number(sp.year) : now.getUTCFullYear();
  const month = sp.month ? Number(sp.month) : now.getUTCMonth() + 1;

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
      rateCategory: "PROJECT_TM",
      startDate: { lt: range.end },
      OR: [{ endDate: null }, { endDate: { gte: range.start } }],
    },
    include: {
      technician: true,
      timesheetEntries: { where: { date: { gte: range.start, lt: range.end } } },
    },
    orderBy: [
      { technician: { lastName: "asc" } },
      { technician: { firstName: "asc" } },
    ],
  });

  const previews = assignments.map((a) => ({
    id: a.id,
    name: `${a.technician.firstName} ${a.technician.lastName}`,
    band: a.technician.band,
    daysWorked: Number(
      computeDaysWorked(
        a.timesheetEntries.map((e) => ({ hours: e.hours, status: e.status })),
        8,
      ).toFixed(2),
    ),
  }));

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
          Generate Project / T&M pre-invoice
        </span>
        <h1 className="text-3xl font-semibold tracking-tighter2">
          {account.org.name} / {account.name} · {monthName} {year}
        </h1>
        <p className="text-sm text-fg-muted">
          Period {range.start.toISOString().slice(0, 10)} → {lastDay.toISOString().slice(0, 10)}.
          {" "}{previews.length} project assignment{previews.length === 1 ? "" : "s"} this month.
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

      <TypeTabs accountId={accountId} active="project" year={year} month={month} />
      <MonthPicker year={year} month={month} />

      {previews.length === 0 ? (
        <div className="glass rounded-lg p-6 text-sm text-fg-muted">
          No PROJECT_TM assignments overlap this month.
        </div>
      ) : (
        <>
          <section className="glass overflow-hidden rounded-lg">
            <table className="w-full text-sm">
              <thead className="bg-surface-2 text-xs uppercase tracking-wider text-fg-subtle">
                <tr>
                  <th className="px-3 py-2 text-left">Technician</th>
                  <th className="px-3 py-2 text-left">Band</th>
                  <th className="px-3 py-2 text-right">Days Worked</th>
                </tr>
              </thead>
              <tbody>
                {previews.map((p) => (
                  <tr key={p.id} className="border-t border-border">
                    <td className="px-3 py-2 font-medium">{p.name}</td>
                    <td className="px-3 py-2 text-fg-muted">Band {p.band}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{p.daysWorked.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
          <ProjectGenerateForm accountId={accountId} year={year} month={month} />
        </>
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
      <button type="submit" className="rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-accent-fg hover:bg-accent-hover">Load</button>
    </form>
  );
}
