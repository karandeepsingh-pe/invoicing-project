// "Rate Sheet" worksheet: the account's filled-in rate card, grouped by rate
// category. Only rows with a non-null rate amount are shown (blank cells in the
// admin matrix are omitted). Pure: receives already-normalised, already-filtered
// entries so it is trivial to unit-test and reuse across every generator.

import ExcelJS from "exceljs";

const CURRENCY_FMT = '"$"#,##0.00';

const HEADER_FILL: ExcelJS.Fill = {
  type: "pattern",
  pattern: "solid",
  fgColor: { argb: "FFD9E1F2" },
};
const CATEGORY_FILL: ExcelJS.Fill = {
  type: "pattern",
  pattern: "solid",
  fgColor: { argb: "FF8FAADC" },
};
const THIN_BORDER: Partial<ExcelJS.Borders> = {
  top: { style: "thin", color: { argb: "FFBFBFBF" } },
  bottom: { style: "thin", color: { argb: "FFBFBFBF" } },
  left: { style: "thin", color: { argb: "FFBFBFBF" } },
  right: { style: "thin", color: { argb: "FFBFBFBF" } },
};

export type RateSheetEntry = {
  category: string; // RateCategory enum value
  subCategoryLabel: string;
  band: number;
  slaCode: string;
  slaLabel: string;
  // Null = unfilled rate; such rows are omitted ("only filled rates").
  rateAmount: number | null;
  effectiveFrom: string; // ISO yyyy-mm-dd
  effectiveTo: string | null;
  notes: string | null;
};

export type RateSheetMeta = {
  orgName: string;
  accountName: string;
  currency: string;
};

// Display order + labels for the rate categories.
const CATEGORY_ORDER: { key: string; label: string }[] = [
  { key: "DEDICATED", label: "Dedicated" },
  { key: "PROJECT_TM", label: "Project / T&M" },
  { key: "SCHEDULED", label: "Scheduled" },
  { key: "DISPATCH_SCHED", label: "Dispatch" },
];

const COLUMNS = ["Sub-Category", "Band", "SLA", "Rate", "Effective From", "Effective To", "Notes"];
const COL_WIDTHS = [30, 7, 16, 14, 16, 16, 30];

/** Append the "Rate Sheet" worksheet to an existing workbook. */
export function writeRateSheet(
  wb: ExcelJS.Workbook,
  meta: RateSheetMeta,
  entries: RateSheetEntry[],
): void {
  const ws = wb.addWorksheet("Rate Sheet");
  COL_WIDTHS.forEach((w, i) => (ws.getColumn(i + 1).width = w));

  ws.getCell("A1").value = `${meta.orgName} / ${meta.accountName} — Rate Sheet (${meta.currency})`;
  ws.getCell("A1").font = { bold: true, size: 12 };
  ws.getRow(1).height = 18;
  ws.addRow([]);

  // Only filled-in rates (a blank cell in the admin matrix → null → omitted).
  const filled = entries.filter((e) => e.rateAmount != null);
  if (filled.length === 0) {
    ws.addRow(["No rates entered for this account."]);
    return;
  }

  for (const cat of CATEGORY_ORDER) {
    const group = filled.filter((e) => e.category === cat.key);
    if (group.length === 0) continue;

    const catRow = ws.addRow([cat.label]);
    catRow.font = { bold: true };
    catRow.getCell(1).fill = CATEGORY_FILL;

    const headerRow = ws.addRow(COLUMNS);
    headerRow.font = { bold: true };
    headerRow.eachCell((cell) => {
      cell.fill = HEADER_FILL;
      cell.border = THIN_BORDER;
    });

    for (const e of group) {
      const row = ws.addRow([
        e.subCategoryLabel,
        e.band,
        e.slaLabel || e.slaCode,
        e.rateAmount,
        e.effectiveFrom,
        e.effectiveTo ?? "—",
        e.notes ?? "",
      ]);
      row.eachCell((cell, col) => {
        cell.border = THIN_BORDER;
        if (col === 4) cell.numFmt = CURRENCY_FMT;
        if (col === 2) cell.alignment = { horizontal: "center" };
      });
    }

    ws.addRow([]);
  }
}
