// Combined pre-invoice: one workbook with FTE / Project / Dispatch sheets + a
// Summary sheet (per-type totals + retainer + reimbursements + grand total).
// FTE/Project are compact roll-up tables; Dispatch reuses the full tracker
// (buildDispatchSheet). Retainer/reimbursements are counted ONCE, on Summary.

import ExcelJS from "exceljs";
import type { PreInvoiceRow } from "./render-pre-invoice";
import type { ProjectRow } from "./render-project";
import {
  buildDispatchSheet,
  type DispatchHeader,
  type DispatchTrackerRow,
} from "./render-dispatch";

export type CombinedHeader = DispatchHeader;
export type CombinedFooter = { retainerFee?: number; reimbursements?: number };

const CURRENCY_FMT = '"$"#,##0.00';
const NUMBER_FMT = "#,##0.00";

function headerFill(cell: ExcelJS.Cell) {
  cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFD9E1F2" } };
  cell.font = { bold: true };
}
function blueFill(cell: ExcelJS.Cell) {
  cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF8FAADC" } };
  cell.font = { bold: true };
}
function border(cell: ExcelJS.Cell) {
  cell.border = {
    top: { style: "thin", color: { argb: "FFBFBFBF" } },
    bottom: { style: "thin", color: { argb: "FFBFBFBF" } },
    left: { style: "thin", color: { argb: "FFBFBFBF" } },
    right: { style: "thin", color: { argb: "FFBFBFBF" } },
  };
}

const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");

/** Generic compact table: title, header, data rows, and a TOTAL row on the last column. */
function buildSimpleSheet(
  sheet: ExcelJS.Worksheet,
  title: string,
  widths: number[],
  headers: string[],
  rows: (string | number | null)[][],
  moneyCols: number[], // 0-based column indices formatted as currency
  total: number,
): void {
  widths.forEach((w, i) => (sheet.getColumn(i + 1).width = w));
  const lastColLetter = LETTERS[headers.length - 1];

  sheet.mergeCells(`A1:${lastColLetter}2`);
  const t = sheet.getCell("A1");
  t.value = title;
  t.font = { bold: true, size: 14 };
  t.alignment = { horizontal: "center", vertical: "middle" };
  blueFill(t);

  const HEADER_ROW = 4;
  headers.forEach((h, i) => {
    const cell = sheet.getCell(`${LETTERS[i]}${HEADER_ROW}`);
    cell.value = h;
    headerFill(cell);
    cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
    border(cell);
  });

  const FIRST = HEADER_ROW + 1;
  rows.forEach((row, idx) => {
    const r = FIRST + idx;
    row.forEach((v, i) => {
      const cell = sheet.getCell(`${LETTERS[i]}${r}`);
      cell.value = v;
      if (moneyCols.includes(i)) cell.numFmt = CURRENCY_FMT;
      border(cell);
    });
  });

  if (rows.length === 0) {
    const cell = sheet.getCell(`A${FIRST}`);
    cell.value = "No rows for this month.";
    sheet.mergeCells(`A${FIRST}:${lastColLetter}${FIRST}`);
  }

  const totalRow = FIRST + Math.max(rows.length, 1);
  sheet.mergeCells(`A${totalRow}:${LETTERS[headers.length - 2]}${totalRow}`);
  const label = sheet.getCell(`A${totalRow}`);
  label.value = "TOTAL";
  label.alignment = { horizontal: "right", vertical: "middle" };
  label.font = { bold: true };
  headerFill(label);
  border(label);
  const totalCell = sheet.getCell(`${lastColLetter}${totalRow}`);
  totalCell.value = total;
  totalCell.numFmt = CURRENCY_FMT;
  totalCell.font = { bold: true };
  headerFill(totalCell);
  border(totalCell);
}

export async function renderCombinedInvoice(
  header: CombinedHeader,
  fteRows: PreInvoiceRow[],
  projectRows: ProjectRow[],
  dispatchRows: DispatchTrackerRow[],
  footer: CombinedFooter,
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Ovation Invoicing";
  workbook.created = new Date();

  const fteTotal = fteRows.reduce((n, r) => n + r.extendedTotal, 0);
  const projectTotal = projectRows.reduce((n, r) => n + r.extendedTotal, 0);
  const dispatchTotal = dispatchRows.reduce((n, r) => n + r.billed, 0);

  // FTE sheet
  const fteSheet = workbook.addWorksheet("FTE", {
    pageSetup: { paperSize: 9, orientation: "landscape", fitToPage: true },
  });
  buildSimpleSheet(
    fteSheet,
    `Dedicated FTE — ${header.accountName} · ${header.monthYearLabel}`,
    [18, 22, 8, 12, 12, 11, 12, 9, 11, 12, 12, 13],
    ["Location", "Technician", "Band", "Backfill", "Business Days", "Days Worked", "Day Rate", "OT Hrs", "OT Rate", "Weekend Hrs", "Weekend Rate", "Total"],
    fteRows.map((r) => [
      r.location, r.technicianName, r.bandLabel, r.backfillLabel, r.businessDays,
      r.daysWorked, r.dayRate, r.otHours, r.otRate, r.weekendHours, r.weekendRate, r.extendedTotal,
    ]),
    [6, 8, 10, 11],
    fteTotal,
  );

  // Project sheet
  const projectSheet = workbook.addWorksheet("Project", {
    pageSetup: { paperSize: 9, orientation: "landscape", fitToPage: true },
  });
  buildSimpleSheet(
    projectSheet,
    `Project / T&M — ${header.accountName} · ${header.monthYearLabel}`,
    [18, 22, 8, 13, 12, 14],
    ["Location", "Technician", "Band", "Day Rate", "Days Worked", "Total"],
    projectRows.map((r) => [r.location, r.technicianName, r.bandLabel, r.dayRate, r.daysWorked, r.extendedTotal]),
    [3, 5],
    projectTotal,
  );

  // Dispatch sheet (full tracker; retainer/reimb counted on Summary, not here)
  const dispatchSheet = workbook.addWorksheet("Dispatch", {
    pageSetup: { paperSize: 9, orientation: "landscape", fitToPage: true },
  });
  buildDispatchSheet(dispatchSheet, header, dispatchRows, { retainerFee: 0, reimbursements: 0 });

  // Summary sheet
  const summary = workbook.addWorksheet("Summary");
  [28, 16].forEach((w, i) => (summary.getColumn(i + 1).width = w));
  summary.mergeCells("A1:B2");
  const st = summary.getCell("A1");
  st.value = `Combined Pre-Invoice — ${header.clientName} / ${header.accountName} · ${header.monthYearLabel}`;
  st.font = { bold: true, size: 14 };
  st.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
  blueFill(st);

  const retainer = footer.retainerFee ?? 0;
  const reimb = footer.reimbursements ?? 0;
  const grand = fteTotal + projectTotal + dispatchTotal + retainer + reimb;
  const lines: [string, number, boolean][] = [
    ["Dedicated FTE", fteTotal, false],
    ["Project / T&M", projectTotal, false],
    ["Dispatch", dispatchTotal, false],
    ["Retainer Fee", retainer, false],
    ["Reimbursements", reimb, false],
    ["GRAND TOTAL", grand, true],
  ];
  lines.forEach(([label, value, bold], i) => {
    const r = 4 + i;
    const lc = summary.getCell(`A${r}`);
    lc.value = label;
    lc.font = { bold };
    border(lc);
    const vc = summary.getCell(`B${r}`);
    vc.value = value;
    vc.numFmt = CURRENCY_FMT;
    vc.font = { bold };
    if (bold) blueFill(vc);
    border(vc);
  });

  // silence unused-format lint in case a sheet has no numeric columns
  void NUMBER_FMT;

  const arrayBuffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(arrayBuffer as ArrayBuffer);
}
