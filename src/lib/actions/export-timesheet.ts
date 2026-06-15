"use server";

import { z } from "zod";
import { requireAdmin } from "@/lib/auth/dev-session";
import { monthRange } from "@/lib/invoice/period";
import { renderTimesheet } from "@/lib/invoice/render-timesheet";
import { loadTimesheetExportInput } from "@/lib/invoice/timesheet-export-data";

const inputSchema = z.object({
  accountId: z.string().min(1),
  year: z.coerce.number().int().min(2000).max(2100),
  month: z.coerce.number().int().min(1).max(12),
});

export type ExportTimesheetResult =
  | { ok: true; filename: string; base64: string }
  | { ok: false; formError: string };

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

  const exportInput = await loadTimesheetExportInput(accountId, year, month);
  if (!exportInput) return { ok: false, formError: "Account not found." };

  const range = monthRange(year, month);
  const monthLabel = range.start.toLocaleString("en-US", { month: "short", timeZone: "UTC" });
  const buffer = await renderTimesheet(exportInput);

  return {
    ok: true,
    filename: `${exportInput.orgName}_${exportInput.accountName}_Timesheet_${monthLabel}_${year}.xlsx`,
    base64: buffer.toString("base64"),
  };
}
