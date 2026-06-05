import Link from "next/link";
import { prisma } from "@/lib/db";
import { notDeleted } from "@/lib/domain/soft-delete";
import { monthRange } from "@/lib/invoice/period";
import { dispatchRateRows, loadDispatchTrackerRows } from "@/lib/invoice/dispatch-rows";
import { dispatchSlaCodes } from "@/lib/domain/rate-dimensions";
import { DispatchVisitsView } from "@/app/admin/dispatch-visits/[accountId]/visits-view";
import { DeleteMonthButton } from "./delete-month-button";

function fmtHM(d: Date): string {
  return d.toLocaleString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
    hour12: false,
  });
}

/**
 * Dispatch (DISPATCH_SCHED) visit block for the combined "All categories" view.
 * Self-contained server component mirroring the standalone dispatch page's data
 * load, but rendering the view with its month picker hidden (the combined page
 * owns the picker).
 */
export async function DispatchCategorySection({
  accountId,
  year,
  month,
  softDeleteEnabled,
  headingId,
  stickyHeading = true,
}: {
  accountId: string;
  year: number;
  month: number;
  softDeleteEnabled: boolean;
  headingId?: string;
  stickyHeading?: boolean;
}) {
  const range = monthRange(year, month);

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

  // Rate-sheet billing per visit (same path the dispatch pre-invoice uses).
  const account = await prisma.clientAccount.findUnique({
    where: { id: accountId },
    include: { org: true, accountRates: { include: { rateSubCategory: true, sla: true } } },
  });
  const currency = account ? account.currency ?? account.org.defaultCurrency : "USD";
  const businessWindow =
    account && account.businessHoursStart && account.businessHoursEnd
      ? { start: account.businessHoursStart, end: account.businessHoursEnd }
      : null;
  const pricedRows = account
    ? await loadDispatchTrackerRows(
        accountId,
        range,
        dispatchRateRows(account.accountRates),
        account.dispatchPricingModel,
        businessWindow,
      )
    : [];

  // Scope the SLA dropdown to the account's rate sheet (priced first), mirroring
  // the standalone dispatch page.
  const isTcs = account?.dispatchPricingModel === "TCS_PRIORITY";
  const dispatchCodeSet = new Set<string>(dispatchSlaCodes);
  const pricedCodes = new Set(
    (account?.accountRates ?? [])
      .filter(
        (r) =>
          r.rateSubCategory.rateCategory === "DISPATCH_SCHED" &&
          r.rateSubCategory.code === "FIRST_HOUR" &&
          r.rateAmount != null,
      )
      .map((r) => r.sla.code),
  );
  const slaOpts = slas
    .filter((s) => (isTcs ? pricedCodes.has(s.code) : dispatchCodeSet.has(s.code) || pricedCodes.has(s.code)))
    .map((s) => ({ id: s.id, code: s.code, label: s.label, priced: pricedCodes.has(s.code) }))
    .sort((a, b) => Number(b.priced) - Number(a.priced) || a.code.localeCompare(b.code));
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

  const qs = `year=${year}&month=${month}`;

  return (
    <section className="flex flex-col gap-3">
      <div className={`${stickyHeading ? "sticky top-0 z-20 backdrop-blur " : ""}-mx-1 flex flex-wrap items-center justify-between gap-2 border-b border-border bg-bg/80 px-1 py-2`}>
        <h2 id={headingId} className="scroll-mt-24 text-lg font-semibold tracking-tightish">
          Dispatch
          <span className="ml-2 text-xs font-normal text-fg-subtle">
            {assignments.length} engineer{assignments.length === 1 ? "" : "s"} · {visits.length}{" "}
            visit{visits.length === 1 ? "" : "s"}
          </span>
        </h2>
        <div className="flex items-center gap-2">
          <Link
            href={`/admin/dispatch-visits/${accountId}?${qs}`}
            className="rounded-md border border-border-strong bg-surface px-2.5 py-1 text-xs font-medium text-fg-muted hover:bg-surface-2"
          >
            Edit only this →
          </Link>
          {softDeleteEnabled && visits.length > 0 && (
            <DeleteMonthButton
              accountId={accountId}
              rateCategories={["DISPATCH_SCHED"]}
              year={year}
              month={month}
              label="Dispatch"
            />
          )}
        </div>
      </div>

      <DispatchVisitsView
        accountId={accountId}
        year={year}
        month={month}
        hideMonthPicker
        currency={currency}
        billing={billingByVisitId}
        assignments={assignments.map((a) => ({
          id: a.id,
          name: `${a.technician.firstName} ${a.technician.lastName}`,
          band: a.technician.band,
          phone: a.technician.phone,
          email: a.technician.email,
        }))}
        slas={slaOpts}
        businessHours={businessWindow}
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
    </section>
  );
}
