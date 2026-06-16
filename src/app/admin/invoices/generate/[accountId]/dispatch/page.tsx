import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { monthRange, lastDayOfMonth } from "@/lib/invoice/period";
import {
  GenerateTypeTabs,
  GenerateMonthPicker,
} from "../_sections/generate-type-tabs";
import { DispatchPreviewSection } from "../_sections/dispatch-preview-section";

export default async function GenerateDispatchPage({
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
        <Link
          href="/admin/invoices"
          className="text-xs font-medium text-fg-subtle hover:text-fg"
        >
          ← Invoices
        </Link>
        <span className="text-[11px] font-semibold uppercase tracking-[0.25em] text-accent">
          Generate Dispatch pre-invoice
        </span>
        <h1 className="break-words text-2xl font-semibold tracking-tighter2 sm:text-3xl">
          {account.org.name} / {account.name} · {monthName} {year}
        </h1>
        <p className="text-sm text-fg-muted">
          Period {range.start.toISOString().slice(0, 10)} → {lastDay.toISOString().slice(0, 10)}.
        </p>
        <div className="flex gap-3 text-xs">
          <Link
            href={`/admin/dispatch-visits/${accountId}?year=${year}&month=${month}`}
            className="ui-link-accent"
          >
            Open visits log →
          </Link>
        </div>
      </header>

      <GenerateTypeTabs accountId={accountId} active="dispatch" year={year} month={month} />
      <GenerateMonthPicker year={year} month={month} />

      <DispatchPreviewSection accountId={accountId} year={year} month={month} />
    </div>
  );
}
