// Dashboard month-cockpit loader. READ-ONLY consumer of the same engines the
// generate pages use, so every number here matches the previews / invoices.
// TODO: past ~25 accounts, cache per-account results (unstable_cache keyed on
// account+month) — at current scale live computation is fast enough.

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { notDeleted } from "@/lib/domain/soft-delete";
import { holidayDatesInRange } from "@/lib/domain/holidays";
import { monthRange, businessDaysInRange, daysInRange, isWeekend } from "@/lib/invoice/period";
import { loadFteRows } from "@/lib/invoice/fte-rows";
import { loadProjectRows } from "@/lib/invoice/project-rows";
import { loadScheduledRows } from "@/lib/invoice/scheduled-rows";
import { dispatchRateRows, loadDispatchTrackerRows } from "@/lib/invoice/dispatch-rows";

export type DashboardAccount = {
  id: string;
  name: string;
  orgName: string;
  subtotal: number;
  blankWeekdayCells: number;
  unpricedCount: number;
  cancelledPending: number;
  generated: boolean;
  hasActivity: boolean;
};

export type DashboardOverview = {
  month: {
    year: number;
    month: number;
    label: string;
    businessDays: number;
    holidays: { date: string; name: string }[];
    weekdaysElapsed: number;
    weekdaysTotal: number;
  };
  accounts: DashboardAccount[];
  runs: {
    id: string;
    accountName: string;
    orgName: string;
    periodLabel: string;
    format: string;
    generatedAt: Date;
    generatedBy: string;
  }[];
  exceptions: {
    overriddenBookings: number;
    ptoDays: number;
    abDays: number;
    standbyMissing: string[];
  };
  counts: { accounts: number; technicians: number; assignments: number };
};

const MONTH_LABEL: Intl.DateTimeFormatOptions = { month: "long", timeZone: "UTC" };

export async function loadDashboardOverview(
  now: Date,
  scope: Prisma.ClientAccountWhereInput = {},
): Promise<DashboardOverview> {
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth() + 1;
  const range = monthRange(year, month);
  const todayIso = now.toISOString().slice(0, 10);
  // SDM dashboards are scoped to their owned accounts; admin scope is {} (all).
  const scoped = Object.keys(scope).length > 0;

  const [phDates, holidayRows, accounts] = await Promise.all([
    holidayDatesInRange(range),
    prisma.holiday.findMany({
      where: { date: { gte: range.start, lt: range.end } },
      orderBy: { date: "asc" },
    }),
    prisma.clientAccount.findMany({
      where: scope,
      orderBy: { name: "asc" },
      include: {
        org: { select: { name: true } },
        accountRates: { include: { rateSubCategory: true, sla: true } },
      },
    }),
  ]);

  // Everything else keys off the in-scope accounts so SDM totals/lists never
  // leak other accounts. For admin (scope {}) accountIds is every account.
  const accountIds = accounts.map((a) => a.id);
  const accountIn = { clientAccountId: { in: accountIds } };

  const [runs, techCount, assignmentCount] = await Promise.all([
    prisma.invoiceRun.findMany({
      where: { clientAccountId: { in: accountIds } },
      take: 8,
      orderBy: { generatedAt: "desc" },
      include: {
        clientAccount: { select: { name: true, org: { select: { name: true } } } },
        generatedBy: { select: { email: true, name: true } },
      },
    }),
    scoped
      ? prisma.technician.count({ where: { assignments: { some: accountIn } } })
      : prisma.technician.count(),
    scoped ? prisma.assignment.count({ where: accountIn }) : prisma.assignment.count(),
  ]);

  const businessDays = businessDaysInRange(range, phDates);
  const monthDays = daysInRange(range);
  const weekdays = monthDays.filter((d) => !isWeekend(d));
  const weekdaysElapsed = weekdays.filter(
    (d) => d.toISOString().slice(0, 10) <= todayIso,
  ).length;

  const accountCards: DashboardAccount[] = await Promise.all(
    accounts.map(async (account) => {
      const businessWindow =
        account.businessHoursStart && account.businessHoursEnd
          ? { start: account.businessHoursStart, end: account.businessHoursEnd }
          : null;

      const [
        fteResult,
        projectRows,
        scheduledRows,
        dispatchRows,
        dedicatedAssignments,
        cancelledPending,
        runExists,
      ] = await Promise.all([
        loadFteRows(account.id, range),
        loadProjectRows(account.id, range),
        loadScheduledRows(account.id, range),
        loadDispatchTrackerRows(
          account.id,
          range,
          dispatchRateRows(account.accountRates),
          account.dispatchPricingModel,
          businessWindow,
        ),
        prisma.assignment.findMany({
          where: {
            clientAccountId: account.id,
            rateCategory: "DEDICATED",
            startDate: { lt: range.end },
            OR: [{ endDate: null }, { endDate: { gte: range.start } }],
          },
          select: {
            startDate: true,
            endDate: true,
            timesheetEntries: {
              where: { ...notDeleted, date: { gte: range.start, lt: range.end } },
              select: { date: true },
            },
          },
        }),
        prisma.dispatchVisit.count({
          where: {
            ...notDeleted,
            workStatus: "CANCELLED",
            cancellationCharge: null,
            visitDate: { gte: range.start, lt: range.end },
            assignment: { clientAccountId: account.id },
          },
        }),
        prisma.invoiceRun.findFirst({
          where: { clientAccountId: account.id, periodYear: year, periodMonth: month },
          select: { id: true },
        }),
      ]);

      // Blank weekday cells: ELAPSED weekdays inside each Dedicated assignment's
      // active window with no live entry — same notion as the grid's amber
      // banner, but only days that have already happened (future days aren't
      // missing, they just haven't occurred).
      let blankWeekdayCells = 0;
      for (const a of dedicatedAssignments) {
        const entered = new Set(a.timesheetEntries.map((e) => e.date.toISOString().slice(0, 10)));
        for (const d of weekdays) {
          const iso = d.toISOString().slice(0, 10);
          if (iso > todayIso) break; // weekdays are chronological
          if (d < a.startDate) continue;
          if (a.endDate !== null && d > a.endDate) continue;
          if (!entered.has(iso)) blankWeekdayCells += 1;
        }
      }

      const dispatchBilled = dispatchRows.reduce((n, r) => n + r.billed, 0);
      const subtotal = Number(
        (
          fteResult.rows.reduce((n, r) => n + r.extendedTotal, 0) +
          projectRows.reduce((n, r) => n + r.extendedTotal, 0) +
          scheduledRows.reduce((n, r) => n + r.extendedTotal, 0) +
          dispatchBilled
        ).toFixed(2),
      );

      const hasActivity =
        fteResult.rows.length > 0 ||
        projectRows.length > 0 ||
        scheduledRows.length > 0 ||
        dispatchRows.length > 0 ||
        dedicatedAssignments.some((a) => a.timesheetEntries.length > 0);

      return {
        id: account.id,
        name: account.name,
        orgName: account.org.name,
        subtotal,
        blankWeekdayCells,
        unpricedCount: fteResult.unpriced.length,
        cancelledPending,
        generated: runExists !== null,
        hasActivity,
      };
    }),
  );

  // TechnicianBooking has no account relation (flat assignmentId), so scope its
  // count via the in-scope assignment ids. Only needed when scoped (admin = all).
  const assignmentIdsInScope = scoped
    ? (
        await prisma.assignment.findMany({ where: accountIn, select: { id: true } })
      ).map((a) => a.id)
    : null;

  const [overriddenBookings, statusGroups, standbyCandidates] = await Promise.all([
    prisma.technicianBooking.count({
      where: {
        deletedAt: null,
        isOverride: true,
        startDateTime: { gte: range.start, lt: range.end },
        ...(assignmentIdsInScope ? { assignmentId: { in: assignmentIdsInScope } } : {}),
      },
    }),
    prisma.timesheetEntry.groupBy({
      by: ["status"],
      where: {
        ...notDeleted,
        status: { in: ["PTO", "AB"] },
        date: { gte: range.start, lt: range.end },
        assignment: accountIn,
      },
      _count: true,
    }),
    prisma.clientAccount.findMany({
      where: {
        id: { in: accountIds },
        dispatchStandbyPerSite: null,
        assignments: {
          some: {
            dispatchVisits: {
              some: { ...notDeleted, visitDate: { gte: range.start, lt: range.end } },
            },
          },
        },
      },
      select: { name: true },
    }),
  ]);

  const monthLabel = range.start.toLocaleString("en-US", MONTH_LABEL);

  return {
    month: {
      year,
      month,
      label: `${monthLabel} ${year}`,
      businessDays,
      holidays: holidayRows.map((h) => ({
        date: h.date.toISOString().slice(0, 10),
        name: h.name,
      })),
      weekdaysElapsed,
      weekdaysTotal: weekdays.length,
    },
    accounts: accountCards,
    runs: runs.map((r) => ({
      id: r.id,
      accountName: r.clientAccount.name,
      orgName: r.clientAccount.org.name,
      periodLabel: `${new Date(Date.UTC(r.periodYear, r.periodMonth - 1, 1)).toLocaleString("en-US", { month: "short", timeZone: "UTC" })} ${r.periodYear}`,
      format: r.format === "FSO" ? "FSO" : "Pre-Invoice",
      generatedAt: r.generatedAt,
      generatedBy: r.generatedBy.name ?? r.generatedBy.email,
    })),
    exceptions: {
      overriddenBookings,
      ptoDays: statusGroups.find((g) => g.status === "PTO")?._count ?? 0,
      abDays: statusGroups.find((g) => g.status === "AB")?._count ?? 0,
      standbyMissing: standbyCandidates.map((a) => a.name),
    },
    counts: { accounts: accounts.length, technicians: techCount, assignments: assignmentCount },
  };
}
