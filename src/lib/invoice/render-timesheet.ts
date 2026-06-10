// Timesheet monthly export: one grid sheet per non-empty category
// (Dedicated / Project / Scheduled — technician rows × day columns, mirroring
// the on-screen grid incl. the Days/OT/Weekend summary) plus a Dispatch Visits
// sheet. Informational export — no rates, no totals in dollars.

import ExcelJS from "exceljs";
import { statusDayCredit, type StatusCode } from "@/lib/validation/cell";
import { isWeekend } from "@/lib/validation/cell-display";

const NUMBER_FMT = "#,##0.00";
const HEADER_FILL: ExcelJS.Fill = {
  type: "pattern",
  pattern: "solid",
  fgColor: { argb: "FFD9E1F2" },
};
const WEEKEND_FILL: ExcelJS.Fill = {
  type: "pattern",
  pattern: "solid",
  fgColor: { argb: "FFEDEDED" },
};
const THIN_BORDER: Partial<ExcelJS.Borders> = {
  top: { style: "thin", color: { argb: "FFBFBFBF" } },
  bottom: { style: "thin", color: { argb: "FFBFBFBF" } },
  left: { style: "thin", color: { argb: "FFBFBFBF" } },
  right: { style: "thin", color: { argb: "FFBFBFBF" } },
};

export type TimesheetExportCell = {
  hours: number | null;
  status: StatusCode | null;
};

export type TimesheetExportRow = {
  technicianName: string;
  band: number;
  slaTier: "BACKFILL" | "NO_BACKFILL" | "NONE";
  location: string;
  // dateIso -> cell (absent = blank)
  cells: Record<string, TimesheetExportCell>;
};

export type TimesheetExportSection = {
  sheetName: string; // "Dedicated" | "Project" | "Scheduled"
  // Dedicated mirrors the billing day-credit (PH=1, PTO=0, HALF_DAY=0.5);
  // Project/Scheduled count HALF_DAY only, like the on-screen grid summary.
  dedicated: boolean;
  rows: TimesheetExportRow[];
};

export type TimesheetExportVisit = {
  visitDate: string;
  technicianName: string;
  ticketNumber: string | null;
  slaCode: string;
  visitTypeLabel: string | null;
  workStatus: string;
  window: string | null; // "HH:mm–HH:mm"
  hoursOnSite: number;
  oooHrs: number | null;
  location: string | null;
};

export type TimesheetExportInput = {
  orgName: string;
  accountName: string;
  monthLabel: string; // "May 2026"
  defaultHours: number;
  days: string[]; // ISO dates of the month, in order
  sections: TimesheetExportSection[];
  visits: TimesheetExportVisit[];
};

function slaLabel(t: TimesheetExportRow["slaTier"]): string {
  if (t === "BACKFILL") return "Backfill";
  if (t === "NO_BACKFILL") return "No Backfill";
  return "—";
}

function cellText(cell: TimesheetExportCell | undefined): string | number {
  if (!cell) return "";
  if (cell.status) return cell.status;
  if (cell.hours === null) return "";
  return cell.hours;
}

// Same split the grid summary + invoice engine use: weekday hours up to
// defaultHours = regular days, excess = OT; weekend hours bucket separately;
// statuses via statusDayCredit (Dedicated) / HALF_DAY-only (Project/Scheduled).
function summarize(
  row: TimesheetExportRow,
  days: string[],
  defaultHours: number,
  dedicated: boolean,
): { days: number; ot: number; weekend: number } {
  let regularDays = 0;
  let otHours = 0;
  let weekendHours = 0;
  for (const d of days) {
    const cell = row.cells[d];
    if (!cell) continue;
    if (cell.status) {
      if (dedicated) regularDays += statusDayCredit(cell.status);
      else if (cell.status === "HALF_DAY") regularDays += 0.5;
      continue;
    }
    const h = cell.hours ?? 0;
    if (h <= 0) continue;
    if (isWeekend(d)) {
      weekendHours += h;
    } else {
      regularDays += Math.min(h, defaultHours) / defaultHours;
      otHours += Math.max(0, h - defaultHours);
    }
  }
  return { days: regularDays, ot: otHours, weekend: weekendHours };
}

function writeGridSheet(
  wb: ExcelJS.Workbook,
  section: TimesheetExportSection,
  input: TimesheetExportInput,
): void {
  const ws = wb.addWorksheet(section.sheetName, {
    views: [{ state: "frozen", xSplit: 1, ySplit: 2 }],
  });

  ws.getCell("A1").value =
    `${input.orgName} / ${input.accountName} — ${section.sheetName} timesheet — ${input.monthLabel} (Default Hours ${input.defaultHours})`;
  ws.getCell("A1").font = { bold: true, size: 12 };
  ws.getRow(1).height = 18;

  const fixedHeaders = ["Technician", "Band", "SLA", "Location", "Days", "OT", "Weekend"];
  const dayHeaders = input.days.map((d) => Number(d.slice(8)));
  const headerRow = ws.addRow([...fixedHeaders, ...dayHeaders]);
  headerRow.font = { bold: true };
  headerRow.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
  headerRow.eachCell((cell, col) => {
    const dayIdx = col - fixedHeaders.length - 1;
    const weekend = dayIdx >= 0 && isWeekend(input.days[dayIdx]);
    cell.fill = weekend ? WEEKEND_FILL : HEADER_FILL;
    cell.border = THIN_BORDER;
  });

  for (const row of section.rows) {
    const s = summarize(row, input.days, input.defaultHours, section.dedicated);
    const values: (string | number)[] = [
      row.technicianName,
      row.band,
      slaLabel(row.slaTier),
      row.location,
      Number(s.days.toFixed(2)),
      Number(s.ot.toFixed(2)),
      Number(s.weekend.toFixed(2)),
      ...input.days.map((d) => cellText(row.cells[d])),
    ];
    const r = ws.addRow(values);
    r.eachCell((cell, col) => {
      cell.border = THIN_BORDER;
      const dayIdx = col - fixedHeaders.length - 1;
      if (dayIdx >= 0) {
        cell.alignment = { horizontal: "center" };
        if (isWeekend(input.days[dayIdx])) cell.fill = WEEKEND_FILL;
      } else if (col >= 5 && col <= 7) {
        cell.numFmt = NUMBER_FMT;
      }
    });
  }

  ws.getColumn(1).width = 26;
  ws.getColumn(2).width = 6;
  ws.getColumn(3).width = 12;
  ws.getColumn(4).width = 22;
  for (const c of [5, 6, 7]) ws.getColumn(c).width = 9;
  for (let i = 0; i < input.days.length; i++) {
    ws.getColumn(fixedHeaders.length + 1 + i).width = 6;
  }
}

function writeVisitsSheet(wb: ExcelJS.Workbook, input: TimesheetExportInput): void {
  const headers = [
    "Date", "Technician", "Ticket", "SLA", "Visit Type", "Status",
    "In–Out", "Total Hrs", "OOO Hrs", "Location",
  ];
  const ws = wb.addWorksheet("Dispatch Visits", { views: [{ state: "frozen", ySplit: 1 }] });
  const headerRow = ws.addRow(headers);
  headerRow.font = { bold: true };
  headerRow.eachCell((cell) => {
    cell.fill = HEADER_FILL;
    cell.border = THIN_BORDER;
  });
  for (const v of input.visits) {
    const r = ws.addRow([
      v.visitDate,
      v.technicianName,
      v.ticketNumber ?? "",
      v.slaCode,
      v.visitTypeLabel ?? "",
      v.workStatus,
      v.window ?? "",
      v.hoursOnSite,
      v.oooHrs ?? "",
      v.location ?? "",
    ]);
    r.eachCell((cell) => {
      cell.border = THIN_BORDER;
      if (typeof cell.value === "number") cell.numFmt = NUMBER_FMT;
    });
  }
  headers.forEach((h, i) => {
    ws.getColumn(i + 1).width = Math.min(28, Math.max(10, h.length + 4));
  });
}

export async function renderTimesheet(input: TimesheetExportInput): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Ovation Invoicing";
  workbook.created = new Date();

  for (const section of input.sections) {
    if (section.rows.length > 0) writeGridSheet(workbook, section, input);
  }
  if (input.visits.length > 0) writeVisitsSheet(workbook, input);

  // Never return an empty workbook — Excel refuses to open zero-sheet files.
  if (workbook.worksheets.length === 0) {
    const ws = workbook.addWorksheet("Timesheet");
    ws.getCell("A1").value =
      `${input.orgName} / ${input.accountName} — no timesheet data for ${input.monthLabel}.`;
  }

  const arrayBuffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(arrayBuffer as ArrayBuffer);
}
