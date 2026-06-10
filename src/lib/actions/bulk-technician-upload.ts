"use server";

import ExcelJS from "exceljs";
import { revalidatePath } from "next/cache";
import { Prisma, RateCategory, AssignmentSlaTier } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/auth/dev-session";
import {
  bulkTechnicianRowSchema,
  BULK_TECHNICIAN_COLUMNS,
} from "@/lib/schemas/bulk-technician-upload";
import { resolvePostalCodeId } from "./postal-code-resolve";

export type BulkRowError = { row: number; message: string };

export type BulkTechUploadResult =
  | { ok: true; created: number; skipped: number; errors: BulkRowError[] }
  | { ok: false; formError: string }
  | null;

function cellToString(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "string") return v.trim();
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === "object") {
    const o = v as Record<string, unknown>;
    if (Array.isArray(o.richText)) {
      return (o.richText as { text?: string }[]).map((t) => t.text ?? "").join("").trim();
    }
    if (typeof o.text === "string") return o.text.trim();
    if ("result" in o) return cellToString(o.result);
    if (typeof o.hyperlink === "string") return o.hyperlink.trim();
  }
  return "";
}

export async function bulkUploadTechnicians(
  _prev: BulkTechUploadResult,
  formData: FormData,
): Promise<BulkTechUploadResult> {
  await requireAdmin();

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
  const sheet = workbook.worksheets[0];
  if (!sheet) return { ok: false, formError: "The workbook has no sheets." };

  const dataRows: { rowNumber: number; row: ExcelJS.Row }[] = [];
  sheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber === 1) return; // header
    dataRows.push({ rowNumber, row });
  });

  const errors: BulkRowError[] = [];
  let created = 0;
  let skipped = 0;
  const orgIdByName = new Map<string, string | null>();
  // (org|first|last) -> first row number seen, for within-file duplicate detection.
  const seenNames = new Map<string, number>();

  for (const { rowNumber, row } of dataRows) {
    const raw: Record<string, string> = {};
    BULK_TECHNICIAN_COLUMNS.forEach((col, idx) => {
      raw[col.key] = cellToString(row.getCell(idx + 1).value);
    });
    // Skip fully blank spacer rows.
    if (!raw.orgName && !raw.firstName && !raw.lastName) continue;

    const parsed = bulkTechnicianRowSchema.safeParse(raw);
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

    // Resolve employer org by name (must already exist; techs do not auto-create orgs).
    const orgKey = r.orgName.toLowerCase();
    let orgId = orgIdByName.get(orgKey);
    if (orgId === undefined) {
      const org = await prisma.org.findUnique({ where: { name: r.orgName }, select: { id: true } });
      orgId = org?.id ?? null;
      orgIdByName.set(orgKey, orgId);
    }
    if (!orgId) {
      errors.push({ row: rowNumber, message: `Org "${r.orgName}" does not exist. Create it first (or via the account upload).` });
      continue;
    }

    // Duplicate guards. The (employerOrgId, employeeId) unique key cannot catch
    // techs without a real Employee ID (Postgres treats NULLs as distinct), so
    // dedupe by name: first within this file, then against the database. Matches
    // are skipped with a per-row message, mirroring the P2002 skip behavior.
    const nameKey = `${orgKey}|${r.firstName.toLowerCase()}|${r.lastName.toLowerCase()}`;
    const firstRow = seenNames.get(nameKey);
    if (firstRow !== undefined) {
      skipped += 1;
      errors.push({ row: rowNumber, message: `"${r.firstName} ${r.lastName}" duplicates row ${firstRow} in this file — skipped.` });
      continue;
    }
    seenNames.set(nameKey, rowNumber);

    const existingByName = await prisma.technician.findFirst({
      where: {
        employerOrgId: orgId,
        firstName: { equals: r.firstName, mode: "insensitive" },
        lastName: { equals: r.lastName, mode: "insensitive" },
      },
      select: { id: true },
    });
    if (existingByName) {
      skipped += 1;
      errors.push({ row: rowNumber, message: `"${r.firstName} ${r.lastName}" already exists under "${r.orgName}" (name match) — skipped.` });
      continue;
    }

    // Dedicated needs a real backfill tier unless the tech is rebadged; other
    // categories carry no tier.
    const tier = r.primaryCategory === RateCategory.DEDICATED ? r.defaultSlaTier : AssignmentSlaTier.NONE;
    if (r.primaryCategory === RateCategory.DEDICATED && !r.isRebadged && tier === AssignmentSlaTier.NONE) {
      errors.push({ row: rowNumber, message: "Dedicated technician needs a Backfill tier (Backfill or No Backfill), unless Rebadged." });
      continue;
    }

    const loc = await resolvePostalCodeId(prisma, {
      zipcode: r.zipcode ?? undefined,
      locationCity: r.city ?? undefined,
      locationState: r.state ?? undefined,
      locationCountry: r.country ?? undefined,
    });
    if (!loc.ok) {
      const msg = Object.values(loc.fieldErrors).flat().join("; ");
      errors.push({ row: rowNumber, message: `Location: ${msg}` });
      continue;
    }

    try {
      await prisma.technician.create({
        data: {
          employerOrgId: orgId,
          employeeId: r.employeeId ?? null,
          firstName: r.firstName,
          lastName: r.lastName,
          primaryCategory: r.primaryCategory,
          band: r.band,
          defaultSlaTier: tier,
          active: true,
          isAvailableForDedicated: r.isAvailableForDedicated,
          isAvailableForProject: r.isAvailableForProject,
          isAvailableForDispatch: r.isAvailableForDispatch,
          phone: r.phone ?? null,
          email: r.email ?? null,
          annualSalary: r.annualSalary != null ? new Prisma.Decimal(r.annualSalary) : null,
          isRebadged: r.isRebadged,
          rebadgedHourlyRate: r.rebadgedHourlyRate != null ? new Prisma.Decimal(r.rebadgedHourlyRate) : null,
          rebadgedDayRate: r.rebadgedDayRate != null ? new Prisma.Decimal(r.rebadgedDayRate) : null,
          rebadgedMonthlyRate: r.rebadgedMonthlyRate != null ? new Prisma.Decimal(r.rebadgedMonthlyRate) : null,
          rebadgedOtRate: r.rebadgedOtRate != null ? new Prisma.Decimal(r.rebadgedOtRate) : null,
          rebadgedWeekendRate: r.rebadgedWeekendRate != null ? new Prisma.Decimal(r.rebadgedWeekendRate) : null,
          postalCodeId: loc.postalCodeId,
          addressLine1: r.addressLine1 ?? null,
        },
      });
      created += 1;
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        skipped += 1;
        errors.push({ row: rowNumber, message: `Employee ID "${r.employeeId ?? ""}" already exists under "${r.orgName}" — skipped.` });
      } else {
        errors.push({ row: rowNumber, message: "Unexpected error creating this row." });
      }
    }
  }

  if (created > 0) {
    revalidatePath("/admin/technicians");
    revalidatePath("/admin/management");
  }
  return { ok: true, created, skipped, errors };
}

export type TemplateResult = { ok: true; base64: string; filename: string };

export async function downloadBulkTechnicianTemplate(): Promise<TemplateResult> {
  await requireAdmin();
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Technicians");
  sheet.addRow(BULK_TECHNICIAN_COLUMNS.map((c) => c.header));
  sheet.getRow(1).font = { bold: true };
  sheet.addRow([
    "Acme Corp", "ACME-001", "Jane", "Doe", "Dedicated", 2, "Backfill",
    "yes", "no", "no", "(555) 123-4567", "jane@acme.com", 74100, "no",
    "", "", "", "", "",
    "94016", "San Francisco", "CA", "USA", "123 Main Street",
  ]);
  sheet.columns.forEach((col) => { col.width = 24; });
  const buffer = await workbook.xlsx.writeBuffer();
  const base64 = Buffer.from(buffer as ArrayBuffer).toString("base64");
  return { ok: true, base64, filename: "technician-upload-template.xlsx" };
}
