"use server";

import ExcelJS from "exceljs";
import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/auth/dev-session";
import {
  bulkAccountRowSchema,
  BULK_ACCOUNT_COLUMNS,
} from "@/lib/schemas/bulk-account-upload";

export type BulkRowError = { row: number; message: string };

export type BulkUploadResult =
  | {
      ok: true;
      created: number;
      orgsCreated: number;
      skipped: number;
      errors: BulkRowError[];
    }
  | { ok: false; formError: string }
  | null;

// ExcelJS cell values can be strings, numbers, dates, formulas, rich text, or
// hyperlink objects. Normalize any of them to a trimmed string.
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

export async function bulkUploadAccounts(
  _prev: BulkUploadResult,
  formData: FormData,
): Promise<BulkUploadResult> {
  await requireAdmin();

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, formError: "Choose an .xlsx file to upload." };
  }

  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(await file.arrayBuffer());
  } catch {
    return {
      ok: false,
      formError: "Could not read that file. Save it as .xlsx and try again.",
    };
  }

  const sheet = workbook.worksheets[0];
  if (!sheet) return { ok: false, formError: "The workbook has no sheets." };

  // Collect data rows synchronously (eachRow is sync), then process with awaits.
  const dataRows: { rowNumber: number; row: ExcelJS.Row }[] = [];
  sheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber === 1) return; // header
    dataRows.push({ rowNumber, row });
  });

  const errors: BulkRowError[] = [];
  let created = 0;
  let skipped = 0;
  let orgsCreated = 0;
  const orgIdByName = new Map<string, string>();

  for (const { rowNumber, row } of dataRows) {
    const raw: Record<string, string> = {};
    BULK_ACCOUNT_COLUMNS.forEach((col, idx) => {
      raw[col.key] = cellToString(row.getCell(idx + 1).value);
    });

    // Skip rows with neither an org nor an account name (blank spacer rows).
    if (!raw.orgName && !raw.accountName) continue;

    const parsed = bulkAccountRowSchema.safeParse(raw);
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

    try {
      const orgKey = r.orgName.toLowerCase();
      let orgId = orgIdByName.get(orgKey);
      if (!orgId) {
        const existing = await prisma.org.findUnique({
          where: { name: r.orgName },
          select: { id: true },
        });
        if (existing) {
          orgId = existing.id;
        } else {
          if (!r.outputTemplate) {
            errors.push({
              row: rowNumber,
              message: `Client "${r.orgName}" does not exist. To auto-create it, set an Output Template (FSO or PRE_INVOICE).`,
            });
            continue;
          }
          const newOrg = await prisma.org.create({
            data: {
              name: r.orgName,
              outputTemplate: r.outputTemplate,
              defaultCurrency: r.orgCurrency ?? "USD",
            },
            select: { id: true },
          });
          orgId = newOrg.id;
          orgsCreated += 1;
        }
        orgIdByName.set(orgKey, orgId);
      }

      await prisma.clientAccount.create({
        data: {
          orgId,
          name: r.accountName,
          currency: r.accountCurrency ?? null,
          clientPocName: r.clientPocName ?? null,
          clientSpocEmail: r.clientSpocEmail ?? null,
          sdmName: r.sdmName ?? null,
          sdmEmail: r.sdmEmail ?? null,
          sdmPhone: r.sdmPhone ?? null,
          projectDescription: r.projectDescription ?? null,
          defaultHours: r.defaultHours,
          addressLine1: r.addressLine1 ?? null,
          city: r.city ?? null,
          state: r.state ?? null,
          postalCode: r.postalCode ?? null,
          country: r.country ?? null,
        },
      });
      created += 1;
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === "P2002"
      ) {
        skipped += 1;
        errors.push({
          row: rowNumber,
          message: `"${r.accountName}" already exists under "${r.orgName}" — skipped.`,
        });
      } else {
        errors.push({ row: rowNumber, message: "Unexpected error creating this row." });
      }
    }
  }

  if (created > 0 || orgsCreated > 0) {
    revalidatePath("/admin/accounts");
    revalidatePath("/admin/management");
    revalidatePath("/admin/orgs");
  }

  return { ok: true, created, orgsCreated, skipped, errors };
}

export type TemplateResult = { ok: true; base64: string; filename: string };

export async function downloadBulkAccountTemplate(): Promise<TemplateResult> {
  await requireAdmin();

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Accounts");
  sheet.addRow(BULK_ACCOUNT_COLUMNS.map((c) => c.header));
  sheet.getRow(1).font = { bold: true };
  sheet.addRow([
    "Acme Corp",
    "PRE_INVOICE",
    "USD",
    "Acme - Dedicated Support",
    "",
    "Jane Doe",
    "jane@acme.com",
    "FTE Dedicated Support",
    8,
    "123 Main Street",
    "San Francisco",
    "CA",
    "94016",
    "USA",
    "Karandeep Talwar",
    "kstalwar@ovationwps.com",
    "+1 555 0100",
  ]);
  sheet.columns.forEach((col) => {
    col.width = 26;
  });

  const buffer = await workbook.xlsx.writeBuffer();
  const base64 = Buffer.from(buffer as ArrayBuffer).toString("base64");
  return { ok: true, base64, filename: "account-upload-template.xlsx" };
}
