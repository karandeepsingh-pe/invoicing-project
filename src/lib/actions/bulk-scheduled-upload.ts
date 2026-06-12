"use server";

import ExcelJS from "exceljs";
import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/auth/dev-session";
import {
  BULK_SCHEDULED_COLUMNS,
  bulkScheduledRowSchema,
} from "@/lib/schemas/bulk-scheduled-upload";
import { cellToString, cellToDateString } from "@/lib/domain/bulk-cells";

export type BulkRowError = { row: number; message: string };

export type BulkScheduledUploadResult =
  | { ok: true; created: number; updated: number; skipped: number; errors: BulkRowError[] }
  | { ok: false; formError: string }
  | null;

export type TemplateResult = { ok: true; base64: string; filename: string };

async function scheduledAssignments(accountId: string) {
  return prisma.assignment.findMany({
    where: { clientAccountId: accountId, rateCategory: "SCHEDULED" },
    include: { technician: { select: { firstName: true, lastName: true } } },
    orderBy: [
      { technician: { firstName: "asc" } },
      { technician: { lastName: "asc" } },
    ],
  });
}

export async function downloadScheduledVisitTemplate(
  accountId: string,
): Promise<TemplateResult | { ok: false; formError: string }> {
  await requireAdmin();

  const account = await prisma.clientAccount.findUnique({
    where: { id: accountId },
    select: { name: true, defaultHours: true },
  });
  if (!account) return { ok: false, formError: "Account not found." };
  const assignments = await scheduledAssignments(accountId);

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Scheduled Visits");
  sheet.addRow(BULK_SCHEDULED_COLUMNS.map((c) => c.header));
  sheet.getRow(1).font = { bold: true };
  const firstTech = assignments[0]?.technician;
  const sampleTech = firstTech ? `${firstTech.firstName} ${firstTech.lastName}` : "Jane Doe";
  sheet.addRow([sampleTech, "2026-06-03", "FULL", ""]);
  sheet.addRow([sampleTech, "2026-06-10", "HALF", ""]);
  sheet.columns.forEach((col) => {
    col.width = 28;
  });

  // FULL bills as a full scheduled day (FULL_DAY rate), HALF as HALF_DAY —
  // priced from the account's rate sheet at invoice time, never from the sheet.
  const ref = workbook.addWorksheet("Reference");
  ref.addRow(["Technicians with a Scheduled assignment on this account (use exactly)"]).font = {
    bold: true,
  };
  for (const a of assignments) {
    ref.addRow([`${a.technician.firstName} ${a.technician.lastName}`]);
  }
  ref.addRow([]);
  ref.addRow(["Day Types"]).font = { bold: true };
  ref.addRow(["FULL", `bills the FULL_DAY rate (recorded as ${account.defaultHours}h)`]);
  ref.addRow(["HALF", "bills the HALF_DAY rate"]);
  ref.getColumn(1).width = 52;
  ref.getColumn(2).width = 44;

  const buffer = await workbook.xlsx.writeBuffer();
  const base64 = Buffer.from(buffer as ArrayBuffer).toString("base64");
  const safeName = account.name.replace(/[^A-Za-z0-9 _-]/g, "").replace(/\s+/g, "_");
  return { ok: true, base64, filename: `Scheduled_Visits_${safeName}_Template.xlsx` };
}

export async function bulkUploadScheduledVisits(
  _prev: BulkScheduledUploadResult,
  formData: FormData,
): Promise<BulkScheduledUploadResult> {
  const admin = await requireAdmin();

  const accountId = String(formData.get("accountId") ?? "");
  if (!accountId) return { ok: false, formError: "Missing account." };

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, formError: "Choose an .xlsx file to upload." };
  }

  const account = await prisma.clientAccount.findUnique({
    where: { id: accountId },
    select: { defaultHours: true },
  });
  if (!account) return { ok: false, formError: "Account not found." };

  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(await file.arrayBuffer());
  } catch {
    return { ok: false, formError: "Could not read that file. Save it as .xlsx and try again." };
  }
  const sheet = workbook.getWorksheet("Scheduled Visits") ?? workbook.worksheets[0];
  if (!sheet) return { ok: false, formError: "The workbook has no sheets." };

  const assignments = await scheduledAssignments(accountId);
  type Asg = (typeof assignments)[number];
  const byName = new Map<string, Asg[]>();
  for (const a of assignments) {
    const key = `${a.technician.firstName} ${a.technician.lastName}`.toLowerCase();
    byName.set(key, [...(byName.get(key) ?? []), a]);
  }

  const dataRows: { rowNumber: number; row: ExcelJS.Row }[] = [];
  sheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber === 1) return;
    dataRows.push({ rowNumber, row });
  });

  const errors: BulkRowError[] = [];
  let created = 0;
  let updated = 0;
  let skipped = 0;

  for (const { rowNumber, row } of dataRows) {
    const raw: Record<string, string> = {};
    BULK_SCHEDULED_COLUMNS.forEach((col, idx) => {
      const v = row.getCell(idx + 1).value;
      raw[col.key] = col.key === "visitDate" ? cellToDateString(v) : cellToString(v);
    });
    if (!raw.technician && !raw.visitDate) continue; // spacer row

    const parsed = bulkScheduledRowSchema.safeParse(raw);
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
    const date = new Date(`${r.visitDate}T00:00:00.000Z`);

    // Resolve the SCHEDULED assignment active on the visit date.
    const candidates = (byName.get(r.technician.toLowerCase()) ?? []).filter(
      (a) => a.startDate <= date && (a.endDate === null || a.endDate >= date),
    );
    if (candidates.length === 0) {
      errors.push({
        row: rowNumber,
        message: `"${r.technician}" has no active Scheduled assignment on ${r.visitDate} (see Reference sheet / assignment dates).`,
      });
      continue;
    }
    if (candidates.length > 1) {
      errors.push({
        row: rowNumber,
        message: `"${r.technician}" matches ${candidates.length} Scheduled assignments on ${r.visitDate} — enter via the grid instead.`,
      });
      continue;
    }
    const assignment = candidates[0];

    // FULL -> defaultHours worked; HALF -> HALF_DAY status (0.5 day), exactly
    // what the grid would store. (assignmentId, date) unique only among live
    // rows (partial index), so: live identical -> skip; live different ->
    // update; soft-deleted or absent -> create.
    const hours = r.dayType === "FULL" ? new Prisma.Decimal(account.defaultHours) : new Prisma.Decimal(0);
    const status = r.dayType === "HALF" ? ("HALF_DAY" as const) : null;

    const existing = await prisma.timesheetEntry.findFirst({
      where: { assignmentId: assignment.id, date, deletedAt: null },
      select: { id: true, hours: true, status: true },
    });
    try {
      if (existing) {
        const same =
          existing.status === status && Number(existing.hours.toString()) === hours.toNumber();
        if (same) {
          skipped += 1;
          continue;
        }
        await prisma.timesheetEntry.update({
          where: { id: existing.id },
          data: { hours, status, enteredById: admin.userId },
        });
        updated += 1;
      } else {
        await prisma.timesheetEntry.create({
          data: {
            assignmentId: assignment.id,
            date,
            hours,
            status,
            enteredById: admin.userId,
          },
        });
        created += 1;
      }
    } catch {
      errors.push({ row: rowNumber, message: "Unexpected error writing this row." });
    }
  }

  if (created > 0 || updated > 0) {
    revalidatePath(`/admin/timesheets/${accountId}`);
  }
  return { ok: true, created, updated, skipped, errors };
}
