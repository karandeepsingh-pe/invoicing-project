// Combined pre-invoice: ONE summary sheet with every engagement type (FTE,
// Project, Scheduled, Dispatch) in a single line-item table, the 3% Project
// Management fee, retainer, reimbursements, and a grand total — reusing the
// shared writePreInvoiceSheet layout. The detailed dispatch visit tracker is
// kept as a separate backup tab (its money is already summarised on sheet 1).

import ExcelJS from "exceljs";
import {
  writePreInvoiceSheet,
  type PreInvoiceHeader,
  type PreInvoiceRow,
  type PreInvoiceFooter,
} from "./render-pre-invoice";
import { buildDispatchSheet, type DispatchTrackerRow } from "./render-dispatch";

export type CombinedHeader = PreInvoiceHeader;
export type CombinedFooter = PreInvoiceFooter;

export async function renderCombinedInvoice(
  header: CombinedHeader,
  rows: PreInvoiceRow[],
  dispatchDetail: DispatchTrackerRow[],
  footer: CombinedFooter,
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Ovation Invoicing";
  workbook.created = new Date();

  // Sheet 1 — the combined pre-invoice (all engagement types + fees + grand total).
  const main = workbook.addWorksheet(`${header.accountName}_Pre-Invoice`, {
    pageSetup: { paperSize: 9, orientation: "landscape", fitToPage: true },
  });
  writePreInvoiceSheet(main, header, rows, footer);

  // Sheet 2 — detailed dispatch visit tracker (backup detail; the per-visit money
  // is already rolled up as Dispatch rows on sheet 1, so no totals here).
  if (dispatchDetail.length > 0) {
    const dispatch = workbook.addWorksheet("Dispatch Visit", {
      pageSetup: { paperSize: 9, orientation: "landscape", fitToPage: true },
    });
    buildDispatchSheet(dispatch, header, dispatchDetail, { retainerFee: 0, reimbursements: 0 });
  }

  const arrayBuffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(arrayBuffer as ArrayBuffer);
}
