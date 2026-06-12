import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { monthRange, lastDayOfMonth } from "@/lib/invoice/period";
import { CombinedGenerateForm } from "./generate-form";
import { FsoGenerateForm } from "./fso-generate-form";
import {
  GenerateTypeTabs,
  GenerateMonthPicker,
} from "../_sections/generate-type-tabs";
import { FtePreviewSection } from "../_sections/fte-preview-section";
import { ProjectPreviewSection } from "../_sections/project-preview-section";
import { DispatchPreviewSection } from "../_sections/dispatch-preview-section";

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
        <span className="text-[11px] font-semibold uppercase tracking-[0.25em] text-accent">
          Generate — all categories
        </span>
        <h1 className="break-words text-2xl font-semibold tracking-tighter2 sm:text-3xl">
          {account.org.name} / {account.name} · {monthName} {year}
        </h1>
        <p className="max-w-2xl text-sm text-fg-muted">
          One Load shows <strong>every category</strong> for this month. Download each
          category on its own, or the <strong>combined workbook</strong> (FTE + Project / T&amp;M
          + Dispatch sheets plus a Summary grand total).
          Period {range.start.toISOString().slice(0, 10)} → {lastDay.toISOString().slice(0, 10)}.
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

      <GenerateTypeTabs accountId={accountId} active="combined" year={year} month={month} variant="scroll" />
      <GenerateMonthPicker year={year} month={month} />

      <section className="glass flex flex-col gap-3 rounded-lg p-4">
        <h2 className="text-sm font-semibold tracking-tightish">Combined workbook</h2>
        <p className="text-xs text-fg-muted">
          All categories in a single .xlsx with a Summary grand total.
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <CombinedGenerateForm
            accountId={accountId}
            year={year}
            month={month}
            retainerPerSite={
              account.dedicatedRetainerPerSite != null
                ? Number(account.dedicatedRetainerPerSite.toString())
                : null
            }
            standbyPerSite={
              account.dispatchStandbyPerSite != null
                ? Number(account.dispatchStandbyPerSite.toString())
                : null
            }
          />
          {account.org.outputTemplate === "FSO" && (
            <FsoGenerateForm accountId={accountId} year={year} month={month} />
          )}
        </div>
        {account.org.outputTemplate === "FSO" && (
          <p className="text-xs text-fg-subtle">
            This account is on the HCL <strong>FSO</strong> template, so it can also export the
            FSO workbook (Dedicated / Dispatch / SV / Project sheets).
          </p>
        )}
      </section>

      <div className="flex flex-col gap-10">
        <FtePreviewSection
          accountId={accountId}
          year={year}
          month={month}
          defaultHours={account.defaultHours}
          showHeading
        />
        <ProjectPreviewSection
          accountId={accountId}
          year={year}
          month={month}
          defaultHours={account.defaultHours}
          showHeading
        />
        <DispatchPreviewSection accountId={accountId} year={year} month={month} showHeading />
      </div>
    </div>
  );
}
