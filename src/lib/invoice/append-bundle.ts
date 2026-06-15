// Appends the self-contained "bundle" sheets to a generated invoice workbook so
// one file carries everything a reviewer needs:
//   • the month's Timesheet (one grid per category + dispatch visits),
//   • the account's Rate Sheet (only filled-in rates),
//   • a Remittance Advice slip (Ovation bank block + per-org bill-to + editable PO#).
//
// Sheet titles are namespaced ("TS - …") so they never collide with the invoice
// workbook's own sheet names (FSO already uses "Dedicated"/"Project Work"/…).

import type ExcelJS from "exceljs";
import { prisma } from "@/lib/db";
import { loadTimesheetExportInput } from "@/lib/invoice/timesheet-export-data";
import { writeTimesheetSheets } from "@/lib/invoice/render-timesheet";
import { writeRateSheet, type RateSheetEntry } from "@/lib/invoice/render-rate-sheet";
import { writeRemittanceSheet } from "@/lib/invoice/render-remittance";
import { clientBillingFor } from "@/lib/constants/remittance";

const TIMESHEET_PREFIX = "TS - ";

export type AppendBundleArgs = {
  accountId: string;
  year: number;
  month: number;
  // Invoice grand total for the remittance slip; omit to leave it blank/editable.
  invoiceTotal?: number;
};

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * Add Timesheet + Rate Sheet + Remittance Advice sheets to `wb` for the given
 * account/period. Self-contained: loads its own data so callers only pass ids.
 */
export async function appendInvoiceBundle(
  wb: ExcelJS.Workbook,
  args: AppendBundleArgs,
): Promise<void> {
  const { accountId, year, month, invoiceTotal } = args;

  const account = await prisma.clientAccount.findUnique({
    where: { id: accountId },
    include: {
      org: true,
      accountRates: {
        include: { rateSubCategory: true, sla: true },
        orderBy: [
          { rateSubCategory: { rateCategory: "asc" } },
          { rateSubCategory: { sortOrder: "asc" } },
          { band: "asc" },
          { sla: { sortOrder: "asc" } },
          { effectiveFrom: "desc" },
        ],
      },
    },
  });
  if (!account) return; // never block invoice download on the bundle

  const currency = account.currency ?? account.org.defaultCurrency;

  // 1) Timesheet sheets (namespaced).
  const timesheetInput = await loadTimesheetExportInput(accountId, year, month);
  if (timesheetInput) {
    writeTimesheetSheets(wb, timesheetInput, { prefix: TIMESHEET_PREFIX });
  }

  // 2) Rate Sheet — writeRateSheet drops unfilled (null-amount) rows itself.
  const entries: RateSheetEntry[] = account.accountRates.map((r) => ({
    category: r.rateSubCategory.rateCategory,
    subCategoryLabel: r.rateSubCategory.label,
    band: r.band,
    slaCode: r.sla.code,
    slaLabel: r.sla.label,
    rateAmount: r.rateAmount != null ? Number(r.rateAmount.toString()) : null,
    effectiveFrom: isoDate(r.effectiveFrom),
    effectiveTo: r.effectiveTo ? isoDate(r.effectiveTo) : null,
    notes: r.notes,
  }));
  writeRateSheet(wb, { orgName: account.org.name, accountName: account.name, currency }, entries);

  // 3) Remittance Advice — bank block + per-org bill-to + invoice total.
  writeRemittanceSheet(wb, {
    client: clientBillingFor(account.org, account),
    invoiceTotal,
  });
}
