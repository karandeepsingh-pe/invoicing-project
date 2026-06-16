"use server";

import ExcelJS from "exceljs";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/auth/dev-session";
import {
  BULK_DISPATCH_COLUMNS,
  bulkDispatchRowSchema,
} from "@/lib/schemas/bulk-dispatch-upload";
import { dispatchVisitCreateSchema } from "@/lib/schemas/dispatch-visit";
import {
  cellToString,
  cellToDateString,
  cellToTimeString,
} from "@/lib/domain/bulk-cells";
import { executeDispatchVisitCreate } from "@/lib/domain/dispatch-visit-create";
import { monthRange } from "@/lib/invoice/period";

export type BulkRowError = { row: number; message: string };

export type BulkDispatchUploadResult =
  | { ok: true; created: number; skipped: number; skippedOffMonth: number; errors: BulkRowError[] }
  | { ok: false; formError: string }
  | null;

export type TemplateResult = { ok: true; base64: string; filename: string };

const DATE_KEYS = new Set(["visitDate", "requestReceivedDate", "proposedOnsiteDate"]);
const TIME_KEYS = new Set(["inTime", "outTime", "visitTime"]);

function fmtConflictWindow(iso: string): string {
  return `${iso.slice(0, 10)} ${iso.slice(11, 16)}`;
}

/** Dispatch-eligible assignments overlapping today-ish — matches the visits page pool. */
async function dispatchAssignments(accountId: string) {
  return prisma.assignment.findMany({
    where: { clientAccountId: accountId, rateCategory: "DISPATCH_SCHED" },
    include: { technician: { select: { firstName: true, lastName: true } } },
    orderBy: [
      { technician: { firstName: "asc" } },
      { technician: { lastName: "asc" } },
    ],
  });
}

export async function downloadDispatchVisitTemplate(
  accountId: string,
): Promise<TemplateResult | { ok: false; formError: string }> {
  await requireAdmin();

  const account = await prisma.clientAccount.findUnique({
    where: { id: accountId },
    select: {
      name: true,
      accountRates: { include: { rateSubCategory: true, sla: true } },
    },
  });
  if (!account) return { ok: false, formError: "Account not found." };

  const [assignments, slas, visitTypes] = await Promise.all([
    dispatchAssignments(accountId),
    prisma.sla.findMany({ orderBy: { sortOrder: "asc" } }),
    prisma.dispatchVisitType.findMany({ where: { active: true }, orderBy: { sortOrder: "asc" } }),
  ]);

  const pricedCodes = new Set(
    account.accountRates
      .filter(
        (r) =>
          r.rateSubCategory.rateCategory === "DISPATCH_SCHED" &&
          r.rateSubCategory.code === "FIRST_HOUR" &&
          r.rateAmount != null,
      )
      .map((r) => r.sla.code),
  );

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Visits");
  sheet.addRow(BULK_DISPATCH_COLUMNS.map((c) => c.header));
  sheet.getRow(1).font = { bold: true };
  const firstTech = assignments[0]?.technician;
  const sampleTech = firstTech ? `${firstTech.firstName} ${firstTech.lastName}` : "Jane Doe";
  const sampleSla = [...pricedCodes][0] ?? "NBD";
  sheet.addRow([
    sampleTech, "2026-06-03", "INC0123456", sampleSla, visitTypes[0]?.code ?? "",
    "Completed", "", "09:15", "11:45", "", "", "N", "N",
    "", "160 New Boston St", "01801", "Woburn", "MA", "USA",
    "2026-06-01", "2026-06-03", "09:00", "", "", "", "", "", "N", "",
  ]);
  sheet.columns.forEach((col) => {
    col.width = 18;
  });

  // Reference sheet: the exact values the importer will accept. Charges are
  // intentionally NOT part of the template — the invoice engine prices every
  // visit from this account's rate sheet, same as manual entry.
  const ref = workbook.addWorksheet("Reference");
  ref.addRow(["Technicians on this account (use exactly)"]).font = { bold: true };
  for (const a of assignments) {
    ref.addRow([`${a.technician.firstName} ${a.technician.lastName}`]);
  }
  ref.addRow([]);
  ref.addRow(["SLA Codes", "Priced on this account?"]).font = { bold: true };
  for (const s of slas) {
    ref.addRow([s.code, pricedCodes.has(s.code) ? "YES" : "no"]);
  }
  ref.addRow([]);
  ref.addRow(["Visit Types"]).font = { bold: true };
  for (const t of visitTypes) ref.addRow([t.code, t.label]);
  ref.addRow([]);
  ref.addRow(["Work Statuses"]).font = { bold: true };
  for (const s of ["Completed", "Cancelled", "Rescheduled", "No-show", "Pending"]) ref.addRow([s]);
  ref.getColumn(1).width = 36;
  ref.getColumn(2).width = 26;

  const buffer = await workbook.xlsx.writeBuffer();
  const base64 = Buffer.from(buffer as ArrayBuffer).toString("base64");
  const safeName = account.name.replace(/[^A-Za-z0-9 _-]/g, "").replace(/\s+/g, "_");
  return { ok: true, base64, filename: `Dispatch_Visits_${safeName}_Template.xlsx` };
}

export async function bulkUploadDispatchVisits(
  _prev: BulkDispatchUploadResult,
  formData: FormData,
): Promise<BulkDispatchUploadResult> {
  const admin = await requireAdmin();

  const accountId = String(formData.get("accountId") ?? "");
  if (!accountId) return { ok: false, formError: "Missing account." };

  const year = Number(formData.get("year"));
  const month = Number(formData.get("month"));
  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
    return { ok: false, formError: "Missing upload month." };
  }
  const range = monthRange(year, month);

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, formError: "Choose an .xlsx file to upload." };
  }

  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(await file.arrayBuffer());
  } catch {
    return { ok: false, formError: "Could not read that file. Save it as .xlsx and try again." };
  }
  const sheet = workbook.getWorksheet("Visits") ?? workbook.worksheets[0];
  if (!sheet) return { ok: false, formError: "The workbook has no sheets." };

  // Replace this month: soft-delete the account's existing live dispatch visits
  // for the selected month before importing, so a re-upload refreshes the month
  // cleanly (other months untouched).
  await prisma.dispatchVisit.updateMany({
    where: {
      deletedAt: null,
      visitDate: { gte: range.start, lt: range.end },
      assignment: { clientAccountId: accountId },
    },
    data: { deletedAt: new Date(), deletedById: admin.userId },
  });

  // Resolution maps: technician full name -> assignment, SLA code -> id,
  // visit type code/label -> id. Names are matched case-insensitively;
  // duplicates flag the row as ambiguous rather than guessing.
  const [assignments, slas, visitTypes] = await Promise.all([
    dispatchAssignments(accountId),
    prisma.sla.findMany(),
    prisma.dispatchVisitType.findMany({ where: { active: true } }),
  ]);
  const assignmentByName = new Map<string, { id: string; count: number }>();
  for (const a of assignments) {
    const key = `${a.technician.firstName} ${a.technician.lastName}`.toLowerCase();
    const existing = assignmentByName.get(key);
    if (existing) existing.count += 1;
    else assignmentByName.set(key, { id: a.id, count: 1 });
  }
  const slaByCode = new Map(slas.map((s) => [s.code.toLowerCase(), s.id]));
  const visitTypeByKey = new Map<string, string>();
  for (const t of visitTypes) {
    visitTypeByKey.set(t.code.toLowerCase(), t.id);
    visitTypeByKey.set(t.label.toLowerCase(), t.id);
  }

  const dataRows: { rowNumber: number; row: ExcelJS.Row }[] = [];
  sheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber === 1) return; // header
    dataRows.push({ rowNumber, row });
  });

  const errors: BulkRowError[] = [];
  let created = 0;
  let skipped = 0;
  let skippedOffMonth = 0;

  for (const { rowNumber, row } of dataRows) {
    const raw: Record<string, string> = {};
    BULK_DISPATCH_COLUMNS.forEach((col, idx) => {
      const v = row.getCell(idx + 1).value;
      raw[col.key] = DATE_KEYS.has(col.key)
        ? cellToDateString(v)
        : TIME_KEYS.has(col.key)
          ? cellToTimeString(v)
          : cellToString(v);
    });
    // Blank spacer rows.
    if (!raw.technician && !raw.visitDate && !raw.ticketNumber) continue;

    const parsed = bulkDispatchRowSchema.safeParse(raw);
    if (!parsed.success) {
      const fieldErrors = parsed.error.flatten().fieldErrors;
      const message =
        Object.entries(fieldErrors)
          .map(([k, v]) => `${k}: ${(v ?? []).join(", ")}`)
          .join("; ") || "Invalid row.";
      errors.push({ row: rowNumber, message });
      continue;
    }
    const r = parsed.data;

    // Month-scope: rows dated outside the selected month are skipped (reported).
    const visitDate = new Date(`${r.visitDate}T00:00:00.000Z`);
    if (visitDate < range.start || visitDate >= range.end) {
      skippedOffMonth += 1;
      continue;
    }

    const techMatch = assignmentByName.get(r.technician.toLowerCase());
    if (!techMatch) {
      errors.push({
        row: rowNumber,
        message: `Technician "${r.technician}" has no Dispatch assignment on this account (see the template's Reference sheet).`,
      });
      continue;
    }
    if (techMatch.count > 1) {
      errors.push({
        row: rowNumber,
        message: `Technician "${r.technician}" matches ${techMatch.count} dispatch assignments — resolve manually via the visit form.`,
      });
      continue;
    }
    const slaId = slaByCode.get(r.slaCode.toLowerCase());
    if (!slaId) {
      errors.push({ row: rowNumber, message: `Unknown SLA Code "${r.slaCode}" (see Reference sheet).` });
      continue;
    }
    let visitTypeId: string | undefined;
    if (r.visitType) {
      visitTypeId = visitTypeByKey.get(r.visitType.toLowerCase());
      if (!visitTypeId) {
        errors.push({ row: rowNumber, message: `Unknown Visit Type "${r.visitType}" (see Reference sheet).` });
        continue;
      }
    }

    // Final gate: the SAME schema the manual form uses.
    const input = dispatchVisitCreateSchema.safeParse({
      assignmentId: techMatch.id,
      visitDate: r.visitDate,
      requestReceivedDate: r.requestReceivedDate,
      proposedOnsiteDate: r.proposedOnsiteDate,
      visitTime: r.visitTime,
      siteCode: r.siteCode ?? "",
      ticketNumber: r.ticketNumber ?? "",
      hoursOnSite: r.hoursOnSite,
      oooHrs: r.oooHrs,
      afterHours: r.afterHours,
      weekend: r.weekend,
      workStatus: r.workStatus,
      cancellationCharge: r.cancellationCharge,
      slaId,
      visitTypeId,
      inTime: r.inTime,
      outTime: r.outTime,
      siteLocation: r.siteLocation ?? "",
      zipcode: r.zipcode ?? "",
      locationCity: r.city ?? "",
      locationState: r.state ?? "",
      locationCountry: r.country ?? "",
      travelHours: r.travelHours,
      travelMiles: r.travelMiles,
      partsAmount: r.partsAmount,
      reimbursementNotes: r.reimbursementNotes ?? "",
      notes: r.notes ?? "",
      override: r.overrideConflict,
      overrideReason: r.overrideReason ?? "",
    });
    if (!input.success) {
      const fieldErrors = input.error.flatten().fieldErrors;
      const message =
        Object.entries(fieldErrors)
          .map(([k, v]) => `${k}: ${(v ?? []).join(", ")}`)
          .join("; ") || "Invalid row.";
      errors.push({ row: rowNumber, message });
      continue;
    }

    // Idempotent re-upload: an identical live visit (same assignment, date,
    // ticket, in-time) is skipped instead of duplicated, so a maintained
    // monthly sheet can be uploaded again safely.
    const dupe = await prisma.dispatchVisit.findFirst({
      where: {
        deletedAt: null,
        assignmentId: techMatch.id,
        visitDate: new Date(`${r.visitDate}T00:00:00.000Z`),
        ticketNumber: r.ticketNumber ?? null,
        startDateTime: r.inTime ? new Date(`${r.visitDate}T${r.inTime}:00.000Z`) : null,
      },
      select: { id: true },
    });
    if (dupe) {
      skipped += 1;
      continue;
    }

    const outcome = await executeDispatchVisitCreate(input.data, admin.userId);
    switch (outcome.kind) {
      case "created":
        created += 1;
        break;
      case "conflict": {
        const windows = outcome.conflicts
          .map((c) => `${fmtConflictWindow(c.startDateTime)}–${c.endDateTime.slice(11, 16)} (${c.accountLabel})`)
          .join("; ");
        errors.push({
          row: rowNumber,
          message: `Booking conflict for "${r.technician}": ${windows}. Set "Override Conflict" = Y to force.`,
        });
        break;
      }
      case "validation": {
        const message = Object.entries(outcome.fieldErrors)
          .map(([k, v]) => `${k}: ${(v ?? []).join(", ")}`)
          .join("; ");
        errors.push({ row: rowNumber, message: message || "Invalid row." });
        break;
      }
      case "notFound":
        errors.push({ row: rowNumber, message: "Assignment vanished mid-upload." });
        break;
      case "dbError":
        errors.push({ row: rowNumber, message: `Database error: ${outcome.code}` });
        break;
    }
  }

  // Always revalidate — the replace step may have removed rows even if the file
  // added none.
  revalidatePath(`/admin/dispatch-visits/${accountId}`);
  revalidatePath(`/admin/timesheets/${accountId}`);
  return { ok: true, created, skipped, skippedOffMonth, errors };
}
