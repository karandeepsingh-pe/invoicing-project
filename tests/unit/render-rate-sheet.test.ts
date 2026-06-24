import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import { writeRateSheet, type RateSheetEntry } from "../../src/lib/invoice/render-rate-sheet";

function sheetValues(ws: ExcelJS.Worksheet): string[] {
  const out: string[] = [];
  ws.eachRow((row) => row.eachCell((cell) => out.push(String(cell.value))));
  return out;
}

const meta = { orgName: "HCL", accountName: "Fiserv", currency: "USD" };

function entry(over: Partial<RateSheetEntry>): RateSheetEntry {
  return {
    category: "DEDICATED",
    subCategoryLabel: "Annual Backfill",
    band: 2,
    slaCode: "NBD",
    slaLabel: "Next Business Day",
    rateAmount: 100,
    effectiveFrom: "2026-01-01",
    effectiveTo: null,
    notes: null,
    ...over,
  };
}

describe("writeRateSheet", () => {
  it("renders a 'Rate Sheet' tab and omits unfilled (null-amount) rows", () => {
    const wb = new ExcelJS.Workbook();
    writeRateSheet(wb, meta, [
      entry({ subCategoryLabel: "Filled Dedicated", rateAmount: 4200 }),
      entry({ subCategoryLabel: "Unfilled Dedicated", rateAmount: null }),
    ]);

    const ws = wb.getWorksheet("Rate Sheet");
    expect(ws).toBeDefined();
    const text = sheetValues(ws!);
    expect(text.join("|")).toContain("Filled Dedicated");
    expect(text.join("|")).not.toContain("Unfilled Dedicated");
    expect(text).toContain("4200"); // rate value present
  });

  it("groups by category and skips categories with no filled rows", () => {
    const wb = new ExcelJS.Workbook();
    writeRateSheet(wb, meta, [
      entry({ category: "DEDICATED", subCategoryLabel: "Ded row", rateAmount: 1 }),
      entry({ category: "PROJECT_TM", subCategoryLabel: "Proj row", rateAmount: null }),
    ]);
    const text = sheetValues(wb.getWorksheet("Rate Sheet")!).join("|");
    expect(text).toContain("Dedicated");
    expect(text).toContain("Ded row");
    expect(text).not.toContain("Project / T&M"); // all PROJECT_TM rows were null
  });

  it("shows a placeholder when no rates are filled", () => {
    const wb = new ExcelJS.Workbook();
    writeRateSheet(wb, meta, [entry({ rateAmount: null })]);
    const text = sheetValues(wb.getWorksheet("Rate Sheet")!).join("|");
    expect(text).toContain("No rates entered for this account.");
  });
});
