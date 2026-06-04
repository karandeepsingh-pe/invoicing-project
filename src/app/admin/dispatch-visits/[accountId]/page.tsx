import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import { notDeleted } from "@/lib/domain/soft-delete";
import { monthRange } from "@/lib/invoice/period";
import { dispatchRateRows, loadDispatchTrackerRows } from "@/lib/invoice/dispatch-rows";
import { DispatchVisitsView } from "./visits-view";
import { DeleteMonthButton } from "../../timesheets/[accountId]/delete-month-button";
import { TimesheetTypeTabs } from "@/components/admin/timesheet-type-tabs";

function fmtHM(d: Date): string {
  return d.toLocaleString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
    hour12: false,
  });
}

export default async function DispatchVisitsPage({
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
    include: { org: true, accountRates: { include: { rateSubCategory: true, sla: true } } },
  });
  if (!account) notFound();

  const range = monthRange(year, month);

  // Price every visit through the SAME path the dispatch pre-invoice uses, so the
  // tracker shows exactly what will be billed (rate sheet driven, per the visit's
  // SLA + hours + after-hours/weekend flags).
  const pricedRows = await loadDispatchTrackerRows(
    accountId,
    range,
    dispatchRateRows(account.accountRates),
    account.dispatchPricingModel,
  );
  const billingByVisitId: Record<
    string,
    { billed: number; totalHrs: number; additionalHours: number; firstHourRate: number; additionalHourRate: number }
  > = {};
  for (const r of pricedRows) {
    billingByVisitId[r.visitId] = {
      billed: r.billed,
      totalHrs: r.totalHrs,
      additionalHours: r.additionalHours,
      firstHourRate: r.firstHourRate,
      additionalHourRate: r.additionalHourRate,
    };
  }

  const assignments = await prisma.assignment.findMany({
    where: {
      clientAccountId: accountId,
      rateCategory: "DISPATCH_SCHED",
      startDate: { lt: range.end },
      OR: [{ endDate: null }, { endDate: { gte: range.start } }],
    },
    include: { technician: true },
    orderBy: [
      { technician: { lastName: "asc" } },
      { technician: { firstName: "asc" } },
    ],
  });

  const visits = await prisma.dispatchVisit.findMany({
    where: {
      ...notDeleted,
      assignmentId: { in: assignments.map((a) => a.id) },
      visitDate: { gte: range.start, lt: range.end },
    },
    include: {
      sla: true,
      visitType: true,
      postalCode: true,
      assignment: { include: { technician: true } },
    },
    orderBy: { visitDate: "asc" },
  });

  const slas = await prisma.sla.findMany({ orderBy: { sortOrder: "asc" } });
  const visitTypes = await prisma.dispatchVisitType.findMany({
    where: { active: true },
    orderBy: { sortOrder: "asc" },
  });

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
          Dispatch / Scheduled Visit
        </span>
        <h1 className="text-3xl font-semibold tracking-tighter2">
          {account.org.name} / {account.name} · {monthName} {year}
        </h1>
        <p className="text-sm text-fg-muted">
          One row per technician site visit. Per-visit charge =
          {" "}<code>FIRST_HOUR + max(0, hours-1) × ADDITIONAL_HOUR</code>, with
          after-hours / weekend uplifts when applicable.
        </p>

        <TimesheetTypeTabs accountId={accountId} year={year} month={month} active="DISPATCH" />
        <div className="mt-1 flex flex-wrap gap-1.5 text-xs">
          <Link
            href={`/admin/invoices/generate/${accountId}/dispatch?year=${year}&month=${month}`}
            className="rounded-md border border-border-strong bg-surface px-2.5 py-1 font-medium text-fg transition-colors hover:bg-surface-2"
          >
            Generate dispatch →
          </Link>
          <Link
            href={`/admin/invoices/generate/${accountId}/combined?year=${year}&month=${month}`}
            className="rounded-md border border-border-strong bg-surface px-2.5 py-1 font-medium text-fg transition-colors hover:bg-surface-2"
          >
            Generate combined →
          </Link>
        </div>
      </header>

      {env.SOFT_DELETE_ENABLED && visits.length > 0 && (
        <div className="flex justify-end">
          <DeleteMonthButton
            accountId={accountId}
            rateCategories={["DISPATCH_SCHED"]}
            year={year}
            month={month}
            label="Dispatch"
          />
        </div>
      )}

      <DispatchVisitsView
        accountId={accountId}
        year={year}
        month={month}
        currency={account.currency ?? account.org.defaultCurrency}
        billing={billingByVisitId}
        assignments={assignments.map((a) => ({
          id: a.id,
          name: `${a.technician.firstName} ${a.technician.lastName}`,
          band: a.technician.band,
          phone: a.technician.phone,
          email: a.technician.email,
        }))}
        slas={slas.map((s) => ({ id: s.id, code: s.code, label: s.label }))}
        visitTypes={visitTypes.map((t) => ({ id: t.id, code: t.code, label: t.label }))}
        visits={visits.map((v) => ({
          id: v.id,
          visitDate: v.visitDate.toISOString().slice(0, 10),
          ticketNumber: v.ticketNumber,
          hoursOnSite: Number(v.hoursOnSite.toString()),
          workStatus: v.workStatus,
          slaCode: v.sla.code,
          technicianName: `${v.assignment.technician.firstName} ${v.assignment.technician.lastName}`,
          siteLocation: v.siteLocation,
          cityState: v.postalCode ? `${v.postalCode.city}, ${v.postalCode.state}` : null,
          visitTypeLabel: v.visitType?.label ?? null,
          window:
            v.startDateTime && v.endDateTime
              ? `${fmtHM(v.startDateTime)}–${fmtHM(v.endDateTime)}`
              : null,
        }))}
      />
    </div>
  );
}
