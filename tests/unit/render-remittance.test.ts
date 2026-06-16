import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import { writeRemittanceSheet } from "../../src/lib/invoice/render-remittance";

function sheetValues(ws: ExcelJS.Worksheet): string[] {
  const out: string[] = [];
  ws.eachRow((row) => row.eachCell((cell) => out.push(String(cell.value))));
  return out;
}

const hclClient = {
  code: "A009",
  name: "HCL America Inc.",
  addressLines: ["2600 Great America Way", "Santa Clara, CA 95054, United States"],
};

describe("writeRemittanceSheet", () => {
  it("writes the Ovation bank block, client block, and invoice total", () => {
    const wb = new ExcelJS.Workbook();
    writeRemittanceSheet(wb, { client: hclClient, invoiceTotal: 3800 });

    const ws = wb.getWorksheet("Remittance Advice");
    expect(ws).toBeDefined();
    const text = sheetValues(ws!).join("|");

    expect(text).toContain("Wells Fargo Bank");
    expect(text).toContain("121 000 248");
    expect(text).toContain("( A009 ) HCL America Inc.");
    expect(text).toContain("2600 Great America Way");
    expect(text).toContain("AMOUNTS PAYABLE IN U.S. FUNDS");

    // Total appears as a numeric cell (not blank).
    const numbers: number[] = [];
    ws!.eachRow((row) =>
      row.eachCell((cell) => {
        if (typeof cell.value === "number") numbers.push(cell.value);
      }),
    );
    expect(numbers).toContain(3800);
    expect(numbers).toContain(0); // tax row
  });

  it("leaves the PO# cell blank (editable) by default", () => {
    const wb = new ExcelJS.Workbook();
    writeRemittanceSheet(wb, { client: hclClient, invoiceTotal: 100 });
    const ws = wb.getWorksheet("Remittance Advice")!;
    expect(ws.getCell("E2").value).toBe("PO #");
    expect(ws.getCell("F2").value).toBe("");
  });

  it("omits a client code when none is provided", () => {
    const wb = new ExcelJS.Workbook();
    writeRemittanceSheet(wb, {
      client: { name: "Acme Co", addressLines: ["1 Main St"] },
    });
    const text = sheetValues(wb.getWorksheet("Remittance Advice")!).join("|");
    expect(text).toContain("Acme Co");
    expect(text).not.toContain("( "); // no "( CODE )" prefix
  });
});
