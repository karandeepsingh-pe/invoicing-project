// Project / T&M pre-invoice xlsx renderer. Per-tech day-rate layout.
//
// Top metadata block matches the Dedicated FTE renderer for consistency.
// Per-tech columns drop OT / Weekend / Backfill columns (not used in Project).

import ExcelJS from "exceljs";

export type ProjectHeader = {
  timePeriod: string;
  clientName: string;
  accountName: string;
  clientPocName: string;
  clientSpocEmail: string;
  projectDescription: string;
  poNumber: string;
  ovationPocName: string;
  ovationPocEmail: string;
  dateOfPreApproval: string;
  monthYearLabel: string;
};

export type ProjectRow = {
  location: string;
  technicianName: string;
  bandLabel: string;
  engineerType: string;
  dayRate: number;
  daysWorked: number;
  extendedTotal: number;
  // True when the per-day total hit the flat monthly cap (full-month billing). The
  // combined sheet blanks the per-day rate and writes Extended as a literal.
  capped?: boolean;
  // True when the line is a flat amount (Weekly / Monthly / day-capped) rather than
  // dayRate × daysWorked. The renderer writes Extended as a literal, no per-day rate.
  flat?: boolean;
  remarks?: string;
};

export type ProjectFooter = {
  retainerFee?: number;
  reimbursements?: number;
};

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

export async function renderProjectInvoice(
  header: ProjectHeader,
  rows: ProjectRow[],
  footer: ProjectFooter,
  appendSheets?: (wb: ExcelJS.Workbook) => Promise<void>,
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Ovation Invoicing";
  workbook.created = new Date();

  const sheet = workbook.addWorksheet(`${header.accountName}_Project_Pre-Invoice`, {
    pageSetup: { paperSize: 9, orientation: "landscape", fitToPage: true },
  });

  const widths = [4, 18, 22, 9, 14, 13, 13, 13, 14];
  widths.forEach((w, i) => (sheet.getColumn(i + 1).width = w));

  // Title
  sheet.mergeCells("B2:I5");
  const titleCell = sheet.getCell("B2");
  titleCell.value = "Ovation WPS - Pre - Approval Invoice (Project / T&M)";
  titleCell.font = { bold: true, size: 18, color: { argb: "FF000000" } };
  blueFill(titleCell);
  center(titleCell);

  // Metadata block rows 7-8
  const metaHeader: [string, string][] = [
    ["B7:C7", "Time Period"],
    ["D7", "Client Name"],
    ["E7", "Account"],
    ["F7", "Client POC name"],
    ["G7", "Client SPOC Email"],
    ["H7", "Project Description"],
    ["I7", "PO #"],
  ];
  for (const [range, label] of metaHeader) {
    if (range.includes(":")) sheet.mergeCells(range);
    const cell = sheet.getCell(range.split(":")[0]);
    cell.value = label;
    headerFill(cell);
    center(cell);
    border(cell);
  }
  const metaValues: [string, string][] = [
    ["B8:C8", header.timePeriod],
    ["D8", header.clientName],
    ["E8", header.accountName],
    ["F8", header.clientPocName],
    ["G8", header.clientSpocEmail],
    ["H8", header.projectDescription],
    ["I8", header.poNumber],
  ];
  for (const [range, value] of metaValues) {
    if (range.includes(":")) sheet.mergeCells(range);
    const cell = sheet.getCell(range.split(":")[0]);
    cell.value = value;
    center(cell);
    border(cell);
  }

  sheet.getCell("B9").value = "Ovation POC name";
  headerFill(sheet.getCell("B9"));
  center(sheet.getCell("B9"));
  border(sheet.getCell("B9"));
  sheet.getCell("B10").value = header.ovationPocName;
  center(sheet.getCell("B10"));
  border(sheet.getCell("B10"));
  sheet.getCell("C9").value = "Ovation POC email";
  headerFill(sheet.getCell("C9"));
  center(sheet.getCell("C9"));
  border(sheet.getCell("C9"));
  sheet.getCell("C10").value = header.ovationPocEmail;
  center(sheet.getCell("C10"));
  border(sheet.getCell("C10"));
  sheet.getCell("D9").value = "Date of Pre-Approval";
  headerFill(sheet.getCell("D9"));
  center(sheet.getCell("D9"));
  border(sheet.getCell("D9"));
  sheet.getCell("D10").value = header.dateOfPreApproval;
  center(sheet.getCell("D10"));
  border(sheet.getCell("D10"));

  // Tech table header row 12
  const tableHeader: [string, string][] = [
    ["B12", "Location"],
    ["C12", "Technician Name"],
    ["D12", "Band"],
    ["E12", "Engineer Type"],
    ["F12", "Day Rate"],
    ["G12", "Days Worked"],
    ["H12", "Extended Total"],
    ["I12", "Remarks"],
  ];
  for (const [ref, label] of tableHeader) {
    const cell = sheet.getCell(ref);
    cell.value = label;
    headerFill(cell);
    center(cell);
    border(cell);
  }
  sheet.getRow(12).height = 30;

  const FIRST_DATA_ROW = 13;
  rows.forEach((row, idx) => {
    const r = FIRST_DATA_ROW + idx;
    sheet.getCell(`B${r}`).value = row.location;
    sheet.getCell(`C${r}`).value = row.technicianName;
    sheet.getCell(`D${r}`).value = row.bandLabel;
    sheet.getCell(`E${r}`).value = row.engineerType;
    // Flat rows (Weekly / Monthly / day-capped) show no per-day rate and a literal
    // Extended; day-rate rows keep the F*G formula.
    sheet.getCell(`F${r}`).value = row.flat ? null : row.dayRate || null;
    sheet.getCell(`F${r}`).numFmt = CURRENCY_FMT;
    sheet.getCell(`G${r}`).value = row.daysWorked;
    sheet.getCell(`G${r}`).numFmt = NUMBER_FMT;
    sheet.getCell(`H${r}`).value = row.flat
      ? row.extendedTotal
      : { formula: `F${r}*G${r}`, result: row.extendedTotal };
    sheet.getCell(`H${r}`).numFmt = CURRENCY_FMT;
    sheet.getCell(`I${r}`).value = row.remarks ?? "";
    for (const col of "BCDEFGHI") {
      border(sheet.getCell(`${col}${r}`));
    }
  });

  const lastDataRow = FIRST_DATA_ROW + Math.max(rows.length, 1) - 1;
  const totalRow = lastDataRow + 1;
  const retainerRow = totalRow + 1;
  const reimRow = retainerRow + 1;
  const finalRow = reimRow + 1;
  const noteRow = finalRow + 2;

  sheet.mergeCells(`B${totalRow}:G${totalRow}`);
  const totalLabel = sheet.getCell(`B${totalRow}`);
  totalLabel.value = "TOTAL";
  totalLabel.alignment = { horizontal: "right", vertical: "middle" };
  totalLabel.font = { bold: true };
  headerFill(totalLabel);
  border(totalLabel);
  const totalCell = sheet.getCell(`H${totalRow}`);
  totalCell.value = {
    formula: `SUM(H${FIRST_DATA_ROW}:H${lastDataRow})`,
    result: rows.reduce((n, r) => n + r.extendedTotal, 0),
  };
  totalCell.numFmt = CURRENCY_FMT;
  totalCell.font = { bold: true };
  headerFill(totalCell);
  border(totalCell);

  sheet.mergeCells(`B${retainerRow}:G${retainerRow}`);
  sheet.getCell(`B${retainerRow}`).value = "Retainer Fee (if applicable)";
  sheet.getCell(`B${retainerRow}`).alignment = { horizontal: "right", vertical: "middle" };
  border(sheet.getCell(`B${retainerRow}`));
  sheet.getCell(`H${retainerRow}`).value = footer.retainerFee ?? 0;
  sheet.getCell(`H${retainerRow}`).numFmt = CURRENCY_FMT;
  border(sheet.getCell(`H${retainerRow}`));

  sheet.mergeCells(`B${reimRow}:G${reimRow}`);
  sheet.getCell(`B${reimRow}`).value = "Reimbursements";
  sheet.getCell(`B${reimRow}`).alignment = { horizontal: "right", vertical: "middle" };
  border(sheet.getCell(`B${reimRow}`));
  sheet.getCell(`H${reimRow}`).value = footer.reimbursements ?? 0;
  sheet.getCell(`H${reimRow}`).numFmt = CURRENCY_FMT;
  border(sheet.getCell(`H${reimRow}`));

  sheet.mergeCells(`B${finalRow}:G${finalRow}`);
  const finalLabel = sheet.getCell(`B${finalRow}`);
  finalLabel.value = "TOTAL";
  finalLabel.alignment = { horizontal: "right", vertical: "middle" };
  finalLabel.font = { bold: true };
  blueFill(finalLabel);
  border(finalLabel);
  const finalCell = sheet.getCell(`H${finalRow}`);
  finalCell.value = {
    formula: `H${totalRow}+H${retainerRow}+H${reimRow}`,
    result:
      rows.reduce((n, r) => n + r.extendedTotal, 0) +
      (footer.retainerFee ?? 0) +
      (footer.reimbursements ?? 0),
  };
  finalCell.numFmt = CURRENCY_FMT;
  finalCell.font = { bold: true };
  blueFill(finalCell);
  border(finalCell);

  sheet.getCell(`B${noteRow}`).value = "Note:";
  sheet.getCell(`B${noteRow}`).font = { bold: true };
  sheet.getCell(`C${noteRow}`).value = `Invoice is for the month ${header.monthYearLabel}`;
  sheet.mergeCells(`C${noteRow}:F${noteRow}`);

  // Optional extra sheets (timesheet + rate sheet + remittance) before serialise.
  if (appendSheets) await appendSheets(workbook);

  const arrayBuffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(arrayBuffer as ArrayBuffer);
}
