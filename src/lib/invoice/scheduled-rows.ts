import { prisma } from "@/lib/db";
import { notDeleted } from "@/lib/domain/soft-delete";
import {
  calculateScheduledRow,
  type ScheduledRateRow,
  type ScheduledTimesheetCell,
} from "./scheduled-calculator";
import { isWithinWindow, toDayIso } from "./assignment-window";
import type { PreInvoiceRow } from "./render-pre-invoice";

/**
 * Load + compute the Scheduled-visit pre-invoice rows for an account + month.
 * Per-day billing off the timesheet (full / half day rates), no monthly cap.
 * Emits `PreInvoiceRow` so it merges onto the combined sheet alongside FTE,
 * Project, and Dispatch rows.
 */
export async function loadScheduledRows(
  accountId: string,
  range: { start: Date; end: Date },
): Promise<PreInvoiceRow[]> {
  const account = await prisma.clientAccount.findUnique({
    where: { id: accountId },
    select: {
      defaultHours: true,
      accountRates: { include: { rateSubCategory: true, sla: true } },
    },
  });
  if (!account) return [];

  const assignments = await prisma.assignment.findMany({
    where: {
      clientAccountId: accountId,
      rateCategory: "SCHEDULED",
      startDate: { lt: range.end },
      OR: [{ endDate: null }, { endDate: { gte: range.start } }],
    },
    include: {
      technician: { include: { postalCode: true } },
      timesheetEntries: {
        where: { ...notDeleted, date: { gte: range.start, lt: range.end } },
      },
    },
    orderBy: [
      { technician: { firstName: "asc" } },
      { technician: { lastName: "asc" } },
    ],
  });

  const scheduledRates: ScheduledRateRow[] = account.accountRates
    .filter((r) => r.rateSubCategory.rateCategory === "SCHEDULED")
    .map((r) => ({
      rateAmount: r.rateAmount,
      band: r.band,
      rateSubCategory: { code: r.rateSubCategory.code },
      sla: { code: r.sla.code },
    }));

  const rows: PreInvoiceRow[] = [];
  for (const a of assignments) {
    const startIso = toDayIso(a.startDate);
    const endIso = a.endDate ? toDayIso(a.endDate) : null;
    const entries: ScheduledTimesheetCell[] = a.timesheetEntries
      .filter((e) => isWithinWindow(toDayIso(e.date), startIso, endIso))
      .map((e) => ({
        hours: e.hours,
        status: e.status,
        date: e.date,
      }));
    const calc = calculateScheduledRow({
      defaultHours: account.defaultHours,
      band: a.technician.band,
      entries,
      rates: scheduledRates,
    });
    const daysWorkedNum = Number(calc.daysWorked.toFixed(2));
    if (daysWorkedNum === 0) continue;

    const location = a.technician.postalCode
      ? `${a.technician.postalCode.city}, ${a.technician.postalCode.state}`
      : "—";

    const totalHalf = calc.halfDays + calc.weekendHalfDays;
    const weekendDays = calc.weekendFullDays + calc.weekendHalfDays;
    const hourlyTotal = Number(calc.hourlyHours.plus(calc.weekendHourlyHours).toFixed(2));
    const remarkBits: string[] = [];
    if (totalHalf > 0) remarkBits.push(`${calc.fullDays + calc.weekendFullDays} full + ${totalHalf} half day(s)`);
    if (weekendDays > 0) remarkBits.push(`${weekendDays} weekend day(s) @ weekend rate`);
    if (hourlyTotal > 0) {
      remarkBits.push(`${hourlyTotal.toFixed(2)} hourly hrs @ $${Number(calc.hourlyRate.toFixed(2))}`);
    }

    rows.push({
      location,
      technicianName: `${a.technician.firstName} ${a.technician.lastName}`,
      bandLabel: `Band ${a.technician.band}`,
      backfillLabel: "",
      engineerType: "Scheduled",
      businessDays: 0, // scheduled rows leave Business Days blank
      daysWorked: daysWorkedNum,
      dayRate: Number(calc.fullDayRate.toFixed(2)),
      otHours: 0,
      otRate: 0,
      weekendHours: 0,
      weekendRate: 0,
      extendedTotal: Number(calc.extendedTotal.toFixed(2)),
      // With half-days, weekend-rate days, or hourly hours the Extended is a
      // sum of distinct rates, which dayRate×daysWorked cannot reconstruct.
      literalExtended: totalHalf > 0 || weekendDays > 0 || hourlyTotal > 0,
      remarks: remarkBits.length > 0 ? remarkBits.join(" · ") : undefined,
    });
  }
  return rows;
}
