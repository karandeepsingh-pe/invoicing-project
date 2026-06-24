import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import {
  writeTimesheetSheets,
  type TimesheetExportInput,
} from "../../src/lib/invoice/render-timesheet";
import { writeRateSheet } from "../../src/lib/invoice/render-rate-sheet";
import { writeRemittanceSheet } from "../../src/lib/invoice/render-remittance";

const timesheetInput: TimesheetExportInput = {
  orgName: "HCL",
  accountName: "Fiserv",
  monthLabel: "June 2026",
  defaultHours: 8,
  days: ["2026-06-01", "2026-06-02"],
  sections: [
    {
      sheetName: "Dedicated",
      dedicated: true,
      rows: [
        {
          technicianName: "Jane Doe",
          band: 2,
          slaTier: "BACKFILL",
          location: "Austin, TX",
          cells: { "2026-06-01": { hours: 8, status: null } },
        },
      ],
    },
    { sheetName: "Project", dedicated: false, rows: [] },
    { sheetName: "Scheduled", dedicated: false, rows: [] },
  ],
  visits: [],
};

describe("invoice bundle sheets", () => {
  it("namespaces timesheet sheets so they never collide with FSO sheet names", () => {
    const wb = new ExcelJS.Workbook();
    // Simulate the FSO workbook, which already owns an "FSO Dedicated" sheet.
    wb.addWorksheet("FSO Dedicated");
    wb.addWorksheet("FSO Project Work");

    writeTimesheetSheets(wb, timesheetInput, { prefix: "TS - " });
    writeRateSheet(
      wb,
      { orgName: "HCL", accountName: "Fiserv", currency: "USD" },
      [
        {
          category: "DEDICATED",
          subCategoryLabel: "Annual Backfill",
          band: 2,
          slaCode: "NBD",
          slaLabel: "Next Business Day",
          rateAmount: 4200,
          effectiveFrom: "2026-01-01",
          effectiveTo: null,
          notes: null,
        },
      ],
    );
    writeRemittanceSheet(wb, {
      client: { name: "HCL America Inc.", code: "A009", addressLines: ["Santa Clara, CA"] },
      invoiceTotal: 3800,
    });

    const names = wb.worksheets.map((w) => w.name);
    // No duplicates (ExcelJS would otherwise have thrown on add).
    expect(new Set(names).size).toBe(names.length);
    expect(names).toContain("FSO Dedicated"); // the original FSO sheet
    expect(names).toContain("TS - Dedicated"); // the namespaced timesheet sheet
    expect(names).toContain("Rate Sheet");
    expect(names).toContain("Remittance Advice");
  });
});
