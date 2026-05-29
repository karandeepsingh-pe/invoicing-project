import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { monthRange, lastDayOfMonth } from "@/lib/invoice/period";
import { CombinedGenerateForm } from "./generate-form";

export default async function GenerateCombinedPage({
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
  const monthName = range.start.toLocaleString("en-US", { month: "long", timeZone: "UTC" });

  return (
    <div className="flex flex-col gap-6 animate-fade-in">
      <header className="flex flex-col gap-1.5">
        <Link href="/admin/invoices" className="text-xs font-medium text-fg-subtle hover:text-fg">
          ← Invoices
        </Link>
        <span className="text-[11px] font-semibold uppercase tracking-wider text-accent">
          Generate Combined pre-invoice
        </span>
        <h1 className="text-3xl font-semibold tracking-tighter2">
          {account.org.name} / {account.name} · {monthName} {year}
        </h1>
        <p className="max-w-2xl text-sm text-fg-muted">
          One workbook with <strong>FTE</strong>, <strong>Project / T&amp;M</strong>, and
          <strong> Dispatch</strong> sheets plus a <strong>Summary</strong> grand total.
          Period {range.start.toISOString().slice(0, 10)} → {lastDay.toISOString().slice(0, 10)}.
        </p>
      </header>

      <MonthPicker year={year} month={month} />

      <CombinedGenerateForm accountId={accountId} year={year} month={month} />
    </div>
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
