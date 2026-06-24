// Dispatch pre-invoice xlsx renderer — full client tracker layout (one row per visit).
// Columns: Request Received Date · Visit Date · Visit Time · Proposed Onsite Date ·
//   Site Code · Location · City · State · Zip · Engineer · Phone · Email ·
//   Vantage Ticket · Work Status · In-Time · Out-Time · Total Hrs · After-1st-hr ·
//   OOO Hrs · Billed · Band · SLA.

import ExcelJS from "exceljs";

export type DispatchHeader = {
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

export type DispatchFooter = {
  retainerFee?: number;
  reimbursements?: number;
};

// One fully-resolved tracker row (billing already computed in the generator).
export type DispatchTrackerRow = {
  visitId: string;
  firstHourRate: number;
  additionalHourRate: number;
  requestReceivedDate: string | null;
  visitDate: string;
  visitTime: string | null;
  proposedOnsiteDate: string | null;
  siteCode: string | null;
  street: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  engineerName: string;
  engineerPhone: string | null;
  engineerEmail: string | null;
  ticketNumber: string | null;
  workStatus: string;
  inTime: string | null;
  outTime: string | null;
  totalHrs: number;
  additionalHours: number;
  oooHrs: number | null;
  billed: number;
  band: number;
  slaCode: string;
};

const CURRENCY_FMT = '"$"#,##0.00';
const NUMBER_FMT = "#,##0.00";

// Column letters for the data table (B … W).
const COLS = [
  "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L",
  "M", "N", "O", "P", "Q", "R", "S", "T", "U", "V", "W",
] as const;
const HEADERS = [
  "Request Received Date", "Visit Date", "Visit Time", "Proposed Onsite Date",
  "Site Code", "Location", "City", "State", "Zip", "Engineer", "Phone",
  "Email", "Vantage Ticket", "Work Status", "In-Time", "Out-Time", "Total Hrs",
  "After 1st Hr", "OOO Hrs", "Billed", "Band", "SLA",
];
const BILLED_COL = "U"; // index 19 in COLS

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

/** Build the dispatch tracker sheet into an existing worksheet (shared by single + combined). */
export function buildDispatchSheet(
  sheet: ExcelJS.Worksheet,
  header: DispatchHeader,
  rows: DispatchTrackerRow[],
  footer: DispatchFooter,
): void {
  const widths = [4, 14, 12, 9, 14, 10, 20, 14, 8, 10, 18, 14, 22, 18, 12, 9, 9, 9, 10, 9, 12, 7, 8];
  widths.forEach((w, i) => (sheet.getColumn(i + 1).width = w));

  // Title
  sheet.mergeCells("B2:W5");
  const titleCell = sheet.getCell("B2");
  titleCell.value = "Ovation WPS - Pre - Approval Invoice (Dispatch)";
  titleCell.font = { bold: true, size: 18, color: { argb: "FF000000" } };
  blueFill(titleCell);
  center(titleCell);

  // Metadata block (rows 7-8)
  const metaHeader: [string, string][] = [
    ["B7:C7", "Time Period"],
    ["D7:E7", "Client Name"],
    ["F7:G7", "Account"],
    ["H7", "Client POC"],
    ["I7:J7", "Client SPOC Email"],
    ["K7:L7", "Project Description"],
    ["M7", "PO #"],
    ["N7:O7", "Ovation POC"],
    ["P7:R7", "Ovation POC email"],
    ["S7:U7", "Date of Pre-Approval"],
  ];
  const metaValues: [string, string][] = [
    ["B8:C8", header.timePeriod],
    ["D8:E8", header.clientName],
    ["F8:G8", header.accountName],
    ["H8", header.clientPocName],
    ["I8:J8", header.clientSpocEmail],
    ["K8:L8", header.projectDescription],
    ["M8", header.poNumber],
    ["N8:O8", header.ovationPocName],
    ["P8:R8", header.ovationPocEmail],
    ["S8:U8", header.dateOfPreApproval],
  ];
  for (const [range, label] of metaHeader) {
    if (range.includes(":")) sheet.mergeCells(range);
    const cell = sheet.getCell(range.split(":")[0]);
    cell.value = label;
    headerFill(cell);
    center(cell);
    border(cell);
  }
  for (const [range, value] of metaValues) {
    if (range.includes(":")) sheet.mergeCells(range);
    const cell = sheet.getCell(range.split(":")[0]);
    cell.value = value;
    center(cell);
    border(cell);
  }

  // Table header row 11
  COLS.forEach((col, i) => {
    const cell = sheet.getCell(`${col}11`);
    cell.value = HEADERS[i];
    headerFill(cell);
    center(cell);
    border(cell);
  });
  sheet.getRow(11).height = 34;

  const FIRST_DATA_ROW = 13;
  rows.forEach((row, idx) => {
    const r = FIRST_DATA_ROW + idx;
    const vals: (string | number | null)[] = [
      row.requestReceivedDate ?? "",
      row.visitDate,
      row.visitTime ?? "",
      row.proposedOnsiteDate ?? "",
      row.siteCode ?? "",
      row.street ?? "",
      row.city ?? "",
      row.state ?? "",
      row.zip ?? "",
      row.engineerName,
      row.engineerPhone ?? "",
      row.engineerEmail ?? "",
      row.ticketNumber ?? "",
      row.workStatus,
      row.inTime ?? "",
      row.outTime ?? "",
      row.totalHrs,
      row.additionalHours,
      row.oooHrs ?? "",
      row.billed || null,
      `Band ${row.band}`,
      row.slaCode,
    ];
    COLS.forEach((col, i) => {
      const cell = sheet.getCell(`${col}${r}`);
      cell.value = vals[i];
      if (col === "R" || col === "S") cell.numFmt = NUMBER_FMT;
      if (col === BILLED_COL) cell.numFmt = CURRENCY_FMT;
      border(cell);
    });
  });

  const lastDataRow = FIRST_DATA_ROW + Math.max(rows.length, 1) - 1;
  const totalRow = lastDataRow + 1;
  const retainerRow = totalRow + 1;
  const reimRow = retainerRow + 1;
  const finalRow = reimRow + 1;
  const noteRow = finalRow + 2;

  const labelSpan = (row: number, label: string, bold: boolean, blue: boolean) => {
    sheet.mergeCells(`B${row}:T${row}`);
    const cell = sheet.getCell(`B${row}`);
    cell.value = label;
    cell.alignment = { horizontal: "right", vertical: "middle" };
    if (bold) cell.font = { bold: true };
    if (blue) blueFill(cell);
    border(cell);
  };

  labelSpan(totalRow, "TOTAL (billable)", true, false);
  const totalCell = sheet.getCell(`${BILLED_COL}${totalRow}`);
  totalCell.value = {
    formula: `SUM(${BILLED_COL}${FIRST_DATA_ROW}:${BILLED_COL}${lastDataRow})`,
    result: rows.reduce((n, r) => n + r.billed, 0),
  };
  totalCell.numFmt = CURRENCY_FMT;
  totalCell.font = { bold: true };
  headerFill(totalCell);
  border(totalCell);

  labelSpan(retainerRow, "Retainer Fee (if applicable)", false, false);
  const retainerCell = sheet.getCell(`${BILLED_COL}${retainerRow}`);
  retainerCell.value = footer.retainerFee ?? 0;
  retainerCell.numFmt = CURRENCY_FMT;
  border(retainerCell);

  labelSpan(reimRow, "Reimbursements", false, false);
  const reimCell = sheet.getCell(`${BILLED_COL}${reimRow}`);
  reimCell.value = footer.reimbursements ?? 0;
  reimCell.numFmt = CURRENCY_FMT;
  border(reimCell);

  labelSpan(finalRow, "TOTAL", true, true);
  const finalCell = sheet.getCell(`${BILLED_COL}${finalRow}`);
  finalCell.value = {
    formula: `${BILLED_COL}${totalRow}+${BILLED_COL}${retainerRow}+${BILLED_COL}${reimRow}`,
    result:
      rows.reduce((n, r) => n + r.billed, 0) +
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
  sheet.mergeCells(`C${noteRow}:H${noteRow}`);
}

export async function renderDispatchInvoice(
  header: DispatchHeader,
  rows: DispatchTrackerRow[],
  footer: DispatchFooter,
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Ovation Invoicing";
  workbook.created = new Date();
  const sheet = workbook.addWorksheet(`${header.accountName}_Dispatch_Pre-Invoice`, {
    pageSetup: { paperSize: 9, orientation: "landscape", fitToPage: true },
  });
  buildDispatchSheet(sheet, header, rows, footer);
  const arrayBuffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(arrayBuffer as ArrayBuffer);
}
