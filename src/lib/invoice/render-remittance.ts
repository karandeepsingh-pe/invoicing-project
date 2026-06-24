// "Remittance Advice" worksheet — reproduces the reference remittance slip:
// Ovation's letterhead + the client (bill-to) block up top, an editable PO #
// cell, then a bordered remit-to / bank-details box ending in the invoice total,
// tax, payable-in-US-funds banner, and the receivables footer note.
//
// The remit-to / bank block is hardcoded (Ovation's receiving account); the
// client block is resolved per org; the PO # cell is left blank for the user to
// type each time; Total/Tax come from the generated invoice (Tax = $0.00).

import ExcelJS from "exceljs";
import { OVATION_REMITTANCE, type ClientBillingDetails } from "@/lib/constants/remittance";

const CURRENCY_FMT = '"$"#,##0.00';

const BOX_BORDER: Partial<ExcelJS.Borders> = {
  top: { style: "thin", color: { argb: "FF000000" } },
  bottom: { style: "thin", color: { argb: "FF000000" } },
  left: { style: "thin", color: { argb: "FF000000" } },
  right: { style: "thin", color: { argb: "FF000000" } },
};

export type RemittanceContext = {
  client: ClientBillingDetails;
  // Invoice grand total; undefined leaves the total cells blank (editable).
  invoiceTotal?: number;
};

function box(cell: ExcelJS.Cell): void {
  cell.border = BOX_BORDER;
}

/** Append the "Remittance Advice" worksheet to an existing workbook. */
export function writeRemittanceSheet(wb: ExcelJS.Workbook, ctx: RemittanceContext): void {
  const ws = wb.addWorksheet("Remittance Advice", {
    pageSetup: { paperSize: 9, orientation: "portrait" },
  });
  ws.getColumn(2).width = 46; // B — labels / descriptions
  ws.getColumn(3).width = 18; // C — values
  ws.getColumn(5).width = 10; // E — "PO #"
  ws.getColumn(6).width = 18; // F — editable PO value

  // --- Letterhead (top-left) ---
  ws.getCell("B1").value = OVATION_REMITTANCE.companyName;
  ws.getCell("B1").font = { bold: true, size: 12 };
  OVATION_REMITTANCE.addressLines.forEach((line, i) => {
    ws.getCell(`B${2 + i}`).value = line;
    ws.getCell(`B${2 + i}`).font = { bold: true };
  });

  // --- PO # (top-right, editable blank cell) ---
  ws.getCell("E2").value = "PO #";
  ws.getCell("E2").font = { bold: true };
  ws.getCell("F2").value = ""; // left blank — typed in per invoice
  ws.getCell("F2").border = { bottom: { style: "thin", color: { argb: "FF000000" } } };

  // --- Client (bill-to) block ---
  ws.getCell("B5").value = "Client Details:";
  ws.getCell("B5").font = { bold: true };
  const clientName = ctx.client.code
    ? `( ${ctx.client.code} ) ${ctx.client.name}`
    : ctx.client.name;
  ws.getCell("B6").value = clientName;
  ws.getCell("B6").font = { bold: true };
  ctx.client.addressLines.forEach((line, i) => {
    ws.getCell(`B${7 + i}`).value = line;
  });

  // --- Bordered remit-to / bank box ---
  const lines: { label: string; value?: number; bold?: boolean }[] = [
    { label: "PLEASE REMIT TO:" },
    { label: OVATION_REMITTANCE.remitToName, bold: true },
    { label: "ELECTRONICALLY PLEASE REMIT:" },
    { label: OVATION_REMITTANCE.bankName },
    { label: `ROUTING #:  ${OVATION_REMITTANCE.routingNumber}` },
    { label: `ACCOUNT #:  ${OVATION_REMITTANCE.accountNumber}` },
    { label: `ACCOUNT NAME: ${OVATION_REMITTANCE.accountName}` },
    { label: "Total for multiple locations on Invoice:", value: ctx.invoiceTotal, bold: true },
    { label: "Tax:", value: 0 },
    { label: "Total:", value: ctx.invoiceTotal, bold: true },
    { label: "" },
    { label: "Amount of your Payment:" },
  ];

  const BOX_START = 12;
  lines.forEach((line, i) => {
    const r = BOX_START + i;
    const labelCell = ws.getCell(`B${r}`);
    labelCell.value = line.label;
    if (line.bold) labelCell.font = { bold: true };
    box(labelCell);

    const valueCell = ws.getCell(`C${r}`);
    if (line.value !== undefined) {
      valueCell.value = line.value;
      valueCell.numFmt = CURRENCY_FMT;
      if (line.bold) valueCell.font = { bold: true };
    }
    box(valueCell);
  });

  // --- Payable banner + footer note ---
  const bannerRow = BOX_START + lines.length + 1;
  ws.getCell(`B${bannerRow}`).value = OVATION_REMITTANCE.payableNote;
  ws.getCell(`B${bannerRow}`).font = { bold: true, size: 14, underline: true };

  const noteRow = bannerRow + 2;
  ws.getCell(`B${noteRow}`).value = OVATION_REMITTANCE.footerNote;
  ws.getCell(`B${noteRow}`).alignment = { wrapText: true, vertical: "top" };
  ws.mergeCells(`B${noteRow}:C${noteRow + 2}`);
}
