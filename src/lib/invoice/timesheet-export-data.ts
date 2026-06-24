// Pure data loader for the monthly timesheet export. Builds the
// TimesheetExportInput (per-category grids + dispatch visits) for an account and
// month, with the same assignment-window + live-entry filters the on-screen grid
// uses. Shared by the standalone timesheet export action and the invoice bundle
// (which embeds these same sheets into every generated workbook).

import { prisma } from "@/lib/db";
import { monthRange } from "@/lib/invoice/period";
import { notDeleted } from "@/lib/domain/soft-delete";
import type {
  TimesheetExportInput,
  TimesheetExportRow,
  TimesheetExportSection,
  TimesheetExportVisit,
} from "@/lib/invoice/render-timesheet";

function fmtIso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function fmtHM(d: Date): string {
  return d.toISOString().slice(11, 16);
}

const DAY_CATEGORIES = [
  { rateCategory: "DEDICATED", sheetName: "Dedicated", dedicated: true },
  { rateCategory: "PROJECT_TM", sheetName: "Project", dedicated: false },
  { rateCategory: "SCHEDULED", sheetName: "Scheduled", dedicated: false },
] as const;

/**
 * Load the monthly timesheet export model for an account, or null when the
 * account does not exist.
 */
export async function loadTimesheetExportInput(
  accountId: string,
  year: number,
  month: number,
): Promise<TimesheetExportInput | null> {
  const account = await prisma.clientAccount.findUnique({
    where: { id: accountId },
    include: { org: true },
  });
  if (!account) return null;

  const range = monthRange(year, month);
  const days: string[] = [];
  for (
    let d = new Date(range.start.getTime());
    d.getTime() < range.end.getTime();
    d.setUTCDate(d.getUTCDate() + 1)
  ) {
    days.push(fmtIso(d));
  }

  const sections: TimesheetExportSection[] = [];
  for (const cat of DAY_CATEGORIES) {
    const assignments = await prisma.assignment.findMany({
      where: {
        clientAccountId: accountId,
        rateCategory: cat.rateCategory,
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

    const rows: TimesheetExportRow[] = assignments.map((a) => {
      const cells: TimesheetExportRow["cells"] = {};
      for (const e of a.timesheetEntries) {
        cells[fmtIso(e.date)] = {
          hours: e.status ? null : Number(e.hours.toString()),
          status: e.status,
        };
      }
      return {
        technicianName: `${a.technician.firstName} ${a.technician.lastName}`,
        band: a.technician.band,
        slaTier: a.slaTier,
        location: a.technician.postalCode
          ? `${a.technician.postalCode.city}, ${a.technician.postalCode.state}`
          : "—",
        cells,
      };
    });

    sections.push({ sheetName: cat.sheetName, dedicated: cat.dedicated, rows });
  }

  const dispatchVisits = await prisma.dispatchVisit.findMany({
    where: {
      ...notDeleted,
      assignment: { clientAccountId: accountId },
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

  const visits: TimesheetExportVisit[] = dispatchVisits.map((v) => ({
    visitDate: fmtIso(v.visitDate),
    technicianName: `${v.assignment.technician.firstName} ${v.assignment.technician.lastName}`,
    ticketNumber: v.ticketNumber,
    slaCode: v.sla.code,
    visitTypeLabel: v.visitType?.label ?? null,
    workStatus: v.workStatus,
    window:
      v.startDateTime && v.endDateTime
        ? `${fmtHM(v.startDateTime)}–${fmtHM(v.endDateTime)}`
        : null,
    hoursOnSite: Number(v.hoursOnSite.toString()),
    oooHrs: v.oooHrs ? Number(v.oooHrs.toString()) : null,
    location: v.postalCode ? `${v.postalCode.city}, ${v.postalCode.state}` : v.siteLocation,
  }));

  return {
    orgName: account.org.name,
    accountName: account.name,
    monthLabel: `${range.start.toLocaleString("en-US", { month: "long", timeZone: "UTC" })} ${year}`,
    defaultHours: account.defaultHours,
    days,
    sections,
    visits,
  };
}
