// Reusable dispatch-only pre-invoice renderer. Driven entirely by the resolved
// tracker rows (DispatchTrackerRow[]), so it serves ANY dispatch format whose
// money is already computed off the rate sheet + dispatch log (TCS today;
// Mindsprint / EverSource / Hiscox later) with no per-format code here.
//
// Two sheets, matching the client TCS workbook:
//   1. "Dispatch"       — Ticket | Location | Date | Cost  + TOTAL  (the invoice)
//   2. "Cost Breakdown" — per-visit math (priority, round-up hrs, first-hour
//                         charge, additional hrs x rate, total charges)
//
// No number is computed here: `billed` and the rate fields arrive pre-resolved.

import ExcelJS from "exceljs";
import type {
  DispatchHeader,
  DispatchFooter,
  DispatchTrackerRow,
} from "./render-dispatch";

const CURRENCY_FMT = '"$"#,##0.00';
const NUMBER_FMT = "#,##0.00";

function blueFill(cell: ExcelJS.Cell) {
  cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF8FAADC" } };
  cell.font = { bold: true, color: { argb: "FF000000" } };
}
function headerFill(cell: ExcelJS.Cell) {
  cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFD9E1F2" } };
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
function center(cell: ExcelJS.Cell) {
  cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
}

function locationOf(r: DispatchTrackerRow): string {
  return [r.city, r.state].filter(Boolean).join(", ") || r.street || "—";
}

/** Write the metadata header block (rows 2..8) spanning columns B..lastCol. */
function writeMeta(
  sheet: ExcelJS.Worksheet,
  header: DispatchHeader,
  lastCol: string,
  titleSuffix: string,
) {
  sheet.mergeCells(`B2:${lastCol}5`);
  const title = sheet.getCell("B2");
  title.value = `Ovation WPS - Pre - Approval Invoice${titleSuffix}`;
  title.font = { bold: true, size: 18, color: { argb: "FF000000" } };
  blueFill(title);
  center(title);

  // Metadata as label/value pairs stacked down two columns (B label, C value).
  const pairs: [string, string][] = [
    ["Time Period", header.timePeriod],
    ["Client Name", header.clientName],
    ["Account", header.accountName],
    ["Client SPOC Email", header.clientSpocEmail],
    ["Project Description", header.projectDescription],
    ["PO #", header.poNumber],
    ["Ovation POC", header.ovationPocName],
    ["Date of Pre-Approval", header.dateOfPreApproval],
  ];
  pairs.forEach(([label, value], i) => {
    const row = 7 + i;
    const l = sheet.getCell(`B${row}`);
    l.value = label;
    headerFill(l);
    border(l);
    const v = sheet.getCell(`C${row}`);
    v.value = value;
    border(v);
  });
}

/** Sheet 1: the dispatch summary invoice (Ticket | Location | Date | Cost + TOTAL). */
function buildSummarySheet(
  sheet: ExcelJS.Worksheet,
  header: DispatchHeader,
  rows: DispatchTrackerRow[],
  footer: DispatchFooter,
) {
  [4, 26, 22, 14, 14].forEach((w, i) => (sheet.getColumn(i + 1).width = w));
  writeMeta(sheet, header, "E", "");

  const HEAD_ROW = 16;
  const heads = ["Ticket", "Location", "Date", "Cost"];
  ["B", "C", "D", "E"].forEach((col, i) => {
    const c = sheet.getCell(`${col}${HEAD_ROW}`);
    c.value = heads[i];
    headerFill(c);
    center(c);
    border(c);
  });

  const FIRST = HEAD_ROW + 1;
  rows.forEach((r, idx) => {
    const rr = FIRST + idx;
    sheet.getCell(`B${rr}`).value = r.ticketNumber ?? "";
    sheet.getCell(`C${rr}`).value = locationOf(r);
    sheet.getCell(`D${rr}`).value = r.visitDate;
    const cost = sheet.getCell(`E${rr}`);
    cost.value = r.billed || 0;
    cost.numFmt = CURRENCY_FMT;
    for (const col of "BCDE") border(sheet.getCell(`${col}${rr}`));
  });

  const lastData = FIRST + Math.max(rows.length, 1) - 1;
  const subtotal = rows.reduce((n, r) => n + (r.billed || 0), 0);
  const retainer = footer.retainerFee ?? 0;
  const reimb = footer.reimbursements ?? 0;

  // Sub-total of the per-visit costs.
  const subRow = lastData + 1;
  const feeRows: { label: string; amount: number }[] = [];
  if (retainer) feeRows.push({ label: "Retainer Fee (if applicable)", amount: retainer });
  if (reimb) feeRows.push({ label: "Reimbursements", amount: reimb });

  const labelTotal = (row: number, label: string, value: number, formula: string, bold: boolean) => {
    sheet.mergeCells(`B${row}:D${row}`);
    const l = sheet.getCell(`B${row}`);
    l.value = label;
    l.alignment = { horizontal: "right", vertical: "middle" };
    if (bold) blueFill(l);
    border(l);
    const c = sheet.getCell(`E${row}`);
    c.value = formula ? { formula, result: value } : value;
    c.numFmt = CURRENCY_FMT;
    if (bold) blueFill(c);
    border(c);
  };

  // When there are no add-on fees, the single TOTAL is the sum (the TCS case).
  if (feeRows.length === 0) {
    labelTotal(subRow, "TOTAL", subtotal, `SUM(E${FIRST}:E${lastData})`, true);
  } else {
    labelTotal(subRow, "Sub-total", subtotal, `SUM(E${FIRST}:E${lastData})`, false);
    feeRows.forEach((f, i) => labelTotal(subRow + 1 + i, f.label, f.amount, "", false));
    const grandRow = subRow + 1 + feeRows.length;
    labelTotal(
      grandRow,
      "TOTAL",
      subtotal + retainer + reimb,
      `E${subRow}+${feeRows.map((_, i) => `E${subRow + 1 + i}`).join("+")}`,
      true,
    );
  }

  const totalRow = subRow + feeRows.length + (feeRows.length === 0 ? 0 : 1);
  const noteRow = totalRow + 2;
  sheet.getCell(`B${noteRow}`).value = "Note:";
  sheet.getCell(`B${noteRow}`).font = { bold: true };
  sheet.getCell(`C${noteRow}`).value = `Invoice is for the month ${header.monthYearLabel}`;
  sheet.mergeCells(`C${noteRow}:E${noteRow}`);
}

/** Sheet 2: per-visit cost breakdown (the rate-sheet math, made legible). */
function buildBreakdownSheet(
  sheet: ExcelJS.Worksheet,
  header: DispatchHeader,
  rows: DispatchTrackerRow[],
) {
  const widths = [4, 22, 9, 14, 8, 20, 9, 9, 11, 13, 10, 11, 13];
  widths.forEach((w, i) => (sheet.getColumn(i + 1).width = w));
  const COLS = ["B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L", "M", "N"];
  const HEADS = [
    "Sr",
    "Ticket",
    "Priority",
    "City",
    "State",
    "Engineer",
    "In",
    "Out",
    "Round-up Hrs",
    "First Hour Charge",
    "Add'l Hrs",
    "Add'l Rate",
    "Total Charges",
  ];
  writeMeta(sheet, header, "N", " (Cost Breakdown)");

  const HEAD_ROW = 16;
  COLS.forEach((col, i) => {
    const c = sheet.getCell(`${col}${HEAD_ROW}`);
    c.value = HEADS[i];
    headerFill(c);
    center(c);
    border(c);
  });
  sheet.getRow(HEAD_ROW).height = 28;

  const FIRST = HEAD_ROW + 1;
  rows.forEach((r, idx) => {
    const rr = FIRST + idx;
    const vals: (string | number | null)[] = [
      idx + 1,
      r.ticketNumber ?? "",
      r.slaCode,
      r.city ?? "",
      r.state ?? "",
      r.engineerName,
      r.inTime ?? "",
      r.outTime ?? "",
      r.totalHrs,
      r.firstHourRate || null,
      r.additionalHours || null,
      r.additionalHourRate || null,
      r.billed || 0,
    ];
    COLS.forEach((col, i) => {
      const c = sheet.getCell(`${col}${rr}`);
      c.value = vals[i];
      if (col === "J") c.numFmt = NUMBER_FMT; // round-up hrs
      if (col === "L") c.numFmt = NUMBER_FMT; // add'l hrs
      if (col === "K" || col === "M" || col === "N") c.numFmt = CURRENCY_FMT;
      border(c);
    });
  });

  const lastData = FIRST + Math.max(rows.length, 1) - 1;
  const totalRow = lastData + 1;
  sheet.mergeCells(`B${totalRow}:M${totalRow}`);
  const tl = sheet.getCell(`B${totalRow}`);
  tl.value = "TOTAL";
  tl.alignment = { horizontal: "right", vertical: "middle" };
  blueFill(tl);
  border(tl);
  const tc = sheet.getCell(`N${totalRow}`);
  tc.value = {
    formula: `SUM(N${FIRST}:N${lastData})`,
    result: rows.reduce((n, r) => n + (r.billed || 0), 0),
  };
  tc.numFmt = CURRENCY_FMT;
  blueFill(tc);
  border(tc);
}

export async function renderDispatchPreInvoice(
  header: DispatchHeader,
  rows: DispatchTrackerRow[],
  footer: DispatchFooter,
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Ovation Invoicing";
  workbook.created = new Date();

  const summary = workbook.addWorksheet("Dispatch", {
    pageSetup: { paperSize: 9, orientation: "landscape", fitToPage: true },
  });
  buildSummarySheet(summary, header, rows, footer);

  const breakdown = workbook.addWorksheet("Cost Breakdown", {
    pageSetup: { paperSize: 9, orientation: "landscape", fitToPage: true },
  });
  buildBreakdownSheet(breakdown, header, rows);

  const arrayBuffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(arrayBuffer as ArrayBuffer);
}
