import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import { writeFsoSheets } from "../../src/lib/invoice/render-fso";

const meta = { customerName: "Fiserv", currency: "USD", serviceMonth: "May-26" };
const emptyData = { dedicated: [], project: [], scheduled: [], dispatch: [] };

describe("writeFsoSheets", () => {
  it("adds the four FSO category sheets to a workbook", () => {
    const wb = new ExcelJS.Workbook();
    writeFsoSheets(wb, meta, emptyData);
    const names = wb.worksheets.map((w) => w.name);
    expect(names).toEqual(["Dedicated", "Project Work", "Dispatch", "SV,Full & Half day Visit"]);
  });

  it("coexists with the Combined workbook sheets without name collisions", () => {
    const wb = new ExcelJS.Workbook();
    wb.addWorksheet("Fiserv_Pre-Invoice");
    wb.addWorksheet("Dispatch Visit");

    writeFsoSheets(wb, meta, emptyData);

    const names = wb.worksheets.map((w) => w.name);
    expect(new Set(names).size).toBe(names.length); // no duplicates
    expect(names).toContain("Fiserv_Pre-Invoice");
    expect(names).toContain("Dispatch Visit"); // combined dispatch tab
    expect(names).toContain("Dispatch"); // FSO dispatch tab — distinct name
    expect(names).toContain("SV,Full & Half day Visit");
  });
});
