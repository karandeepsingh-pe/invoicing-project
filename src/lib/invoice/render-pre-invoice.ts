import ExcelJS from "exceljs";

export type PreInvoiceHeader = {
  timePeriod: string;          // "01/04/2026 - 30/04/2026"
  clientName: string;          // Org name, e.g. "HCL"
  accountName: string;         // Account name, e.g. "ZF"
  clientPocName: string;
  clientSpocEmail: string;
  projectDescription: string;  // e.g. "FTE - Dedicated Support"
  poNumber: string;            // Blank by default — entered manually post-download
  ovationPocName: string;
  ovationPocEmail: string;
  dateOfPreApproval: string;   // "5th May 2026"
  monthYearLabel: string;      // "Apr 2026" — used in note row
};

export type PreInvoiceRow = {
  location: string;
  technicianName: string;
  bandLabel: string;           // "Band 2", "Band 3"
  backfillLabel: string;       // "Backfill" or "No Backfill"
  engineerType: string;        // "FTE" | "Project" | "Scheduled" | "Dispatch"
  businessDays: number;        // 0 renders blank (Scheduled / Dispatch)
  daysWorked: number;
  dayRate: number;             // per-day rate (monthly ÷ business days)
  otHours: number;
  otRate: number;
  weekendHours: number;
  weekendRate: number;
  extendedTotal: number;
  // When true, Extended Total is written as a literal instead of the
  // I*H + J*K + L*M formula. Needed for rows where Extended is not simply
  // dayRate × daysWorked: a monthly-capped Project row, a Scheduled row with
  // half-days, or a per-visit Dispatch row.
  literalExtended?: boolean;
  remarks?: string;
};

export type PreInvoiceFooter = {
  retainerFee?: number;
  reimbursements?: number;
  // Percentage add-on (e.g. a 3% project management fee), already computed to a
  // money amount by the engine. Rendered between the subtotal and grand total.
  projectManagementFee?: { label: string; amount: number };
  // Additional labeled flat fees (e.g. per-site Retainer/Standby lines:
  // "Standby — Dispatch (10 sites × $425)"). Rendered before the retainer row.
  extraFees?: { label: string; amount: number }[];
};

const CURRENCY_FMT = '"$"#,##0.00';
const NUMBER_FMT = "#,##0.00";

const COL_WIDTHS = [4, 18, 22, 9, 14, 14, 13, 12, 12, 10, 10, 12, 11, 14, 12];
// Column index: A=1; we paint into B..O (2..15).

function applyBlueFill(cell: ExcelJS.Cell) {
  cell.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FF8FAADC" },
  };
  cell.font = { bold: true, color: { argb: "FF000000" } };
}

function applyHeaderFill(cell: ExcelJS.Cell) {
  cell.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FFD9E1F2" },
  };
  cell.font = { bold: true };
}

function applyBorder(cell: ExcelJS.Cell) {
  cell.border = {
    top: { style: "thin", color: { argb: "FFBFBFBF" } },
    bottom: { style: "thin", color: { argb: "FFBFBFBF" } },
    left: { style: "thin", color: { argb: "FFBFBFBF" } },
    right: { style: "thin", color: { argb: "FFBFBFBF" } },
  };
}

function centerAlign(cell: ExcelJS.Cell) {
  cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
}

/**
 * Renders the ZF-format pre-invoice xlsx to a Buffer. Layout mirrors the
 * "Ovation WPS - Pre - Approval Invoice" reference (ZF April 2026).
 *
 * Sheet name follows existing convention: "<Account>_Pre-Invoice".
 */
export async function renderPreInvoice(
  header: PreInvoiceHeader,
  rows: PreInvoiceRow[],
  footer: PreInvoiceFooter,
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Ovation Invoicing";
  workbook.created = new Date();

  const sheet = workbook.addWorksheet(`${header.accountName}_Pre-Invoice`, {
    pageSetup: { paperSize: 9, orientation: "landscape", fitToPage: true },
  });

  writePreInvoiceSheet(sheet, header, rows, footer);

  const arrayBuffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(arrayBuffer as ArrayBuffer);
}

/**
 * Populate an existing worksheet with the pre-invoice layout: title, metadata,
 * the unified line-item table (FTE / Project / Scheduled / Dispatch rows),
 * subtotal, optional PM fee, retainer, reimbursements, and the grand total.
 * Extracted so the combined generator can place this same sheet alongside detail
 * tabs (e.g. the dispatch tracker) in one workbook.
 */
export function writePreInvoiceSheet(
  sheet: ExcelJS.Worksheet,
  header: PreInvoiceHeader,
  rows: PreInvoiceRow[],
  footer: PreInvoiceFooter,
): void {
  COL_WIDTHS.forEach((w, i) => {
    sheet.getColumn(i + 1).width = w;
  });

  // ── Title row (rows 1..5 reserved; title spans B2:O5 merged blue band) ──
  sheet.mergeCells("B2:O5");
  const titleCell = sheet.getCell("B2");
  titleCell.value = "Ovation WPS - Pre - Approval Invoice";
  titleCell.font = { bold: true, size: 18, color: { argb: "FF000000" } };
  applyBlueFill(titleCell);
  centerAlign(titleCell);

  // ── Metadata header row 7 ──
  const metaHeader: [string, string][] = [
    ["B7:C7", "Time Period"],
    ["D7", "Client Name"],
    ["E7", "Account"],
    ["F7", "Client POC name"],
    ["G7:H7", "Client SPOC Email ID"],
    ["I7", "Project Description"],
    ["J7", "PO #"],
    ["K7", "Ovation POC name"],
    ["L7:M7", "Ovation POC email ID"],
    ["N7:O7", "Date of Pre-Approval"],
  ];
  for (const [range, label] of metaHeader) {
    if (range.includes(":")) sheet.mergeCells(range);
    const ref = range.split(":")[0];
    const cell = sheet.getCell(ref);
    cell.value = label;
    applyHeaderFill(cell);
    centerAlign(cell);
    applyBorder(cell);
  }

  // ── Metadata values row 8 ──
  const metaValues: [string, string][] = [
    ["B8:C8", header.timePeriod],
    ["D8", header.clientName],
    ["E8", header.accountName],
    ["F8", header.clientPocName],
    ["G8:H8", header.clientSpocEmail],
    ["I8", header.projectDescription],
    ["J8", header.poNumber],
    ["K8", header.ovationPocName],
    ["L8:M8", header.ovationPocEmail],
    ["N8:O8", header.dateOfPreApproval],
  ];
  for (const [range, value] of metaValues) {
    if (range.includes(":")) sheet.mergeCells(range);
    const ref = range.split(":")[0];
    const cell = sheet.getCell(ref);
    cell.value = value;
    centerAlign(cell);
    applyBorder(cell);
  }

  // ── Tech table header row 11 ──
  const tableHeader: [string, string][] = [
    ["B11", "Location"],
    ["C11", "Technician Name"],
    ["D11", "Band"],
    ["E11", "BAND SLA"],
    ["F11", "Enginer Type"],
    ["G11", "Business Days"],
    ["H11", "Days Worked"],
    ["I11", "Day Rate"],
    ["J11", "OT Hours"],
    ["K11", "OT Rate"],
    ["L11", "Weekend Hour"],
    ["M11", "Weekend Rate"],
    ["N11", "Extended Total"],
    ["O11", "Remarks"],
  ];
  for (const [ref, label] of tableHeader) {
    const cell = sheet.getCell(ref);
    cell.value = label;
    applyHeaderFill(cell);
    centerAlign(cell);
    applyBorder(cell);
  }
  sheet.getRow(11).height = 30;

  // ── Sub-header row 12 ──
  sheet.mergeCells("E12:F12");
  const subSlaCell = sheet.getCell("E12");
  subSlaCell.value = "Backfill/ No Backfill          FTE/Project/Dispatch";
  subSlaCell.font = { italic: true, size: 9 };
  centerAlign(subSlaCell);
  applyBorder(subSlaCell);

  // ── Data rows from row 13 ──
  const FIRST_DATA_ROW = 13;
  rows.forEach((row, idx) => {
    const r = FIRST_DATA_ROW + idx;
    sheet.getCell(`B${r}`).value = row.location;
    sheet.getCell(`C${r}`).value = row.technicianName;
    sheet.getCell(`D${r}`).value = row.bandLabel;
    sheet.getCell(`E${r}`).value = row.backfillLabel;
    sheet.getCell(`F${r}`).value = row.engineerType;
    sheet.getCell(`G${r}`).value = row.businessDays || null;
    sheet.getCell(`G${r}`).numFmt = NUMBER_FMT;
    sheet.getCell(`H${r}`).value = row.daysWorked || null;
    sheet.getCell(`H${r}`).numFmt = NUMBER_FMT;
    sheet.getCell(`I${r}`).value = row.dayRate || null;
    sheet.getCell(`I${r}`).numFmt = CURRENCY_FMT;
    sheet.getCell(`J${r}`).value = row.otHours || null;
    sheet.getCell(`J${r}`).numFmt = NUMBER_FMT;
    sheet.getCell(`K${r}`).value = row.otRate || null;
    sheet.getCell(`K${r}`).numFmt = CURRENCY_FMT;
    sheet.getCell(`L${r}`).value = row.weekendHours || null;
    sheet.getCell(`L${r}`).numFmt = NUMBER_FMT;
    sheet.getCell(`M${r}`).value = row.weekendRate || null;
    sheet.getCell(`M${r}`).numFmt = CURRENCY_FMT;
    // Extended total. For most rows it is Day Rate × Days Worked + OT + Weekend,
    // written as a live formula. Rows where that identity does not hold (a
    // monthly-capped Project row, a Scheduled row with half-days, or a per-visit
    // Dispatch row) carry literalExtended and write the computed value directly.
    sheet.getCell(`N${r}`).value = row.literalExtended
      ? row.extendedTotal
      : {
          formula: `I${r}*H${r}+J${r}*K${r}+L${r}*M${r}`,
          result: row.extendedTotal,
        };
    sheet.getCell(`N${r}`).numFmt = CURRENCY_FMT;
    sheet.getCell(`O${r}`).value = row.remarks ?? "";
    for (const col of "BCDEFGHIJKLMNO") {
      applyBorder(sheet.getCell(`${col}${r}`));
    }
  });

  const lastDataRow = FIRST_DATA_ROW + Math.max(rows.length, 1) - 1;
  const totalRow1 = lastDataRow + 1;
  const pmRow = footer.projectManagementFee ? totalRow1 + 1 : null;
  const extraFees = footer.extraFees ?? [];
  const firstExtraRow = (pmRow ?? totalRow1) + 1;
  const retainerRow = firstExtraRow + extraFees.length;
  const reimbursementsRow = retainerRow + 1;
  const totalRow2 = reimbursementsRow + 1;
  const noteRow = totalRow2 + 2;

  // ── Sub-total row ──
  sheet.mergeCells(`B${totalRow1}:M${totalRow1}`);
  const totalLabel1 = sheet.getCell(`B${totalRow1}`);
  totalLabel1.value = "TOTAL";
  totalLabel1.alignment = { horizontal: "right", vertical: "middle" };
  totalLabel1.font = { bold: true };
  applyHeaderFill(totalLabel1);
  applyBorder(totalLabel1);
  const totalCell1 = sheet.getCell(`N${totalRow1}`);
  totalCell1.value = {
    formula: `SUM(N${FIRST_DATA_ROW}:N${lastDataRow})`,
    result: rows.reduce((n, r) => n + r.extendedTotal, 0),
  };
  totalCell1.numFmt = CURRENCY_FMT;
  totalCell1.font = { bold: true };
  applyHeaderFill(totalCell1);
  applyBorder(totalCell1);

  // ── Project Management Fee row (percentage add-on, when present) ──
  if (pmRow !== null && footer.projectManagementFee) {
    sheet.mergeCells(`B${pmRow}:M${pmRow}`);
    const pmLabel = sheet.getCell(`B${pmRow}`);
    pmLabel.value = footer.projectManagementFee.label;
    pmLabel.alignment = { horizontal: "right", vertical: "middle" };
    applyBorder(pmLabel);
    const pmCell = sheet.getCell(`N${pmRow}`);
    pmCell.value = footer.projectManagementFee.amount;
    pmCell.numFmt = CURRENCY_FMT;
    applyBorder(pmCell);
  }

  // ── Extra labeled fee rows (per-site Retainer/Standby lines) ──
  extraFees.forEach((fee, i) => {
    const r = firstExtraRow + i;
    sheet.mergeCells(`B${r}:M${r}`);
    const label = sheet.getCell(`B${r}`);
    label.value = fee.label;
    label.alignment = { horizontal: "right", vertical: "middle" };
    applyBorder(label);
    const cell = sheet.getCell(`N${r}`);
    cell.value = fee.amount;
    cell.numFmt = CURRENCY_FMT;
    applyBorder(cell);
  });

  // ── Retainer Fee row ──
  sheet.mergeCells(`B${retainerRow}:M${retainerRow}`);
  const retainerLabel = sheet.getCell(`B${retainerRow}`);
  retainerLabel.value = "Retainer Fee (if applicable)";
  retainerLabel.alignment = { horizontal: "right", vertical: "middle" };
  applyBorder(retainerLabel);
  const retainerCell = sheet.getCell(`N${retainerRow}`);
  retainerCell.value = footer.retainerFee ?? 0;
  retainerCell.numFmt = CURRENCY_FMT;
  applyBorder(retainerCell);

  // ── Reimbursements row ──
  sheet.mergeCells(`B${reimbursementsRow}:M${reimbursementsRow}`);
  const reimLabel = sheet.getCell(`B${reimbursementsRow}`);
  reimLabel.value = "Reimbursements";
  reimLabel.alignment = { horizontal: "right", vertical: "middle" };
  applyBorder(reimLabel);
  const reimCell = sheet.getCell(`N${reimbursementsRow}`);
  reimCell.value = footer.reimbursements ?? 0;
  reimCell.numFmt = CURRENCY_FMT;
  applyBorder(reimCell);

  // ── Final TOTAL ──
  sheet.mergeCells(`B${totalRow2}:M${totalRow2}`);
  const totalLabel2 = sheet.getCell(`B${totalRow2}`);
  totalLabel2.value = "TOTAL";
  totalLabel2.alignment = { horizontal: "right", vertical: "middle" };
  totalLabel2.font = { bold: true };
  applyBlueFill(totalLabel2);
  applyBorder(totalLabel2);
  const totalCell2 = sheet.getCell(`N${totalRow2}`);
  const extraFeeRefs = extraFees.map((_, i) => `N${firstExtraRow + i}`);
  const sumRefs = [
    `N${totalRow1}`,
    ...(pmRow !== null ? [`N${pmRow}`] : []),
    ...extraFeeRefs,
    `N${retainerRow}`,
    `N${reimbursementsRow}`,
  ];
  totalCell2.value = {
    formula: sumRefs.join("+"),
    result:
      rows.reduce((n, r) => n + r.extendedTotal, 0) +
      (footer.projectManagementFee?.amount ?? 0) +
      extraFees.reduce((n, f) => n + f.amount, 0) +
      (footer.retainerFee ?? 0) +
      (footer.reimbursements ?? 0),
  };
  totalCell2.numFmt = CURRENCY_FMT;
  totalCell2.font = { bold: true };
  applyBlueFill(totalCell2);
  applyBorder(totalCell2);

  // ── Note row ──
  sheet.getCell(`B${noteRow}`).value = "Note:";
  sheet.getCell(`B${noteRow}`).font = { bold: true };
  sheet.getCell(`C${noteRow}`).value = `Invoice is for the month ${header.monthYearLabel}`;
  sheet.mergeCells(`C${noteRow}:F${noteRow}`);
}
