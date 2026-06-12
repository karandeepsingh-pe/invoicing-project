"use server";

import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/auth/dev-session";
import { monthRange } from "@/lib/invoice/period";
import { notDeleted } from "@/lib/domain/soft-delete";
import {
  renderTimesheet,
  type TimesheetExportRow,
  type TimesheetExportSection,
  type TimesheetExportVisit,
} from "@/lib/invoice/render-timesheet";

const inputSchema = z.object({
  accountId: z.string().min(1),
  year: z.coerce.number().int().min(2000).max(2100),
  month: z.coerce.number().int().min(1).max(12),
});

export type ExportTimesheetResult =
  | { ok: true; filename: string; base64: string }
  | { ok: false; formError: string };

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
 * Build the monthly timesheet workbook for an account: one grid sheet per
 * non-empty day-category (mirrors the on-screen grid incl. Days/OT/Weekend)
 * plus a Dispatch Visits sheet. Informational — no rates or amounts.
 */
export async function exportTimesheetXlsx(input: {
  accountId: string;
  year: number;
  month: number;
}): Promise<ExportTimesheetResult> {
  await requireAdmin();
  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, formError: "Invalid export request." };
  const { accountId, year, month } = parsed.data;

  const account = await prisma.clientAccount.findUnique({
    where: { id: accountId },
    include: { org: true },
  });
  if (!account) return { ok: false, formError: "Account not found." };

  const range = monthRange(year, month);
  const days: string[] = [];
  for (
    let d = new Date(range.start.getTime());
    d.getTime() < range.end.getTime();
    d.setUTCDate(d.getUTCDate() + 1)
  ) {
    days.push(fmtIso(d));
  }

  // Day-grid categories: same assignment window + live-entry filters as the
  // on-screen grid (category-section.tsx).
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

  // Dispatch visits for the month (live only), as on the dispatch section table.
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

  const monthLabel = range.start.toLocaleString("en-US", { month: "short", timeZone: "UTC" });
  const buffer = await renderTimesheet({
    orgName: account.org.name,
    accountName: account.name,
    monthLabel: `${range.start.toLocaleString("en-US", { month: "long", timeZone: "UTC" })} ${year}`,
    defaultHours: account.defaultHours,
    days,
    sections,
    visits,
  });

  return {
    ok: true,
    filename: `${account.org.name}_${account.name}_Timesheet_${monthLabel}_${year}.xlsx`,
    base64: buffer.toString("base64"),
  };
}
