// FSO (HCL) workbook renderer. Builds a standalone .xlsx with the four HCL billing
// sheets (Dedicated, Dispatch, SV Full & Half day Visit, Project Work), headers
// matching the HCL template, one row per line. HCL-only columns with no app source
// get the constants the reference uses. Pure: takes pre-loaded FSO rows + meta.

import ExcelJS from "exceljs";
import type {
  FsoDedicatedRow,
  FsoDispatchRow,
  FsoProjectRow,
  FsoScheduledRow,
} from "./fso-rows";

const NUMBER_FMT = "#,##0.00";
const PARTNER = "Ovation";

export type FsoMeta = {
  customerName: string; // the account name, e.g. "ZF FRIEDRICHSHAFEN"
  currency: string;
  serviceMonth: string; // "Mar-26"
};

export type FsoData = {
  dedicated: FsoDedicatedRow[];
  dispatch: FsoDispatchRow[];
  scheduled: FsoScheduledRow[];
  project: FsoProjectRow[];
};

type Cell = string | number;

function writeSheet(wb: ExcelJS.Workbook, name: string, headers: string[], rows: Cell[][]): void {
  const ws = wb.addWorksheet(name, { views: [{ state: "frozen", ySplit: 1 }] });
  ws.addRow(headers);
  const headerRow = ws.getRow(1);
  headerRow.font = { bold: true };
  headerRow.alignment = { vertical: "middle", wrapText: true };
  headerRow.eachCell((cell) => {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFD9E1F2" } };
    cell.border = {
      top: { style: "thin", color: { argb: "FFBFBFBF" } },
      bottom: { style: "thin", color: { argb: "FFBFBFBF" } },
      left: { style: "thin", color: { argb: "FFBFBFBF" } },
      right: { style: "thin", color: { argb: "FFBFBFBF" } },
    };
  });
  for (const r of rows) {
    const row = ws.addRow(r);
    row.eachCell((cell) => {
      if (typeof cell.value === "number") cell.numFmt = NUMBER_FMT;
    });
  }
  // Reasonable widths; first columns narrow, location wider.
  headers.forEach((h, i) => {
    const col = ws.getColumn(i + 1);
    col.width = Math.min(28, Math.max(10, h.length + 2));
  });
}

const DEDICATED_HEADERS = [
  "Site Category", "Customer Name", "Partner Name", "Country", "State", "City",
  "Site Address", "Zip Code", "PO Number", "Technician name", "Band", "Variant",
  "Number of working days", "Number of worked days", "Monthly rate", "Actual Cost",
  "OT Hours", "OT per Hour Rate", "OT Hours cost", "Weekened OT Hours", "Weekend Rate",
  "Weekend Cost", "Travel/extra cost if applicable as per contract", "Total Cost ",
  "Tax % ", "Tax cost", "Total Cost including Tax", "Currency", "SLA %", "SLA Met",
  "Reason for SLA not met(if applicable)", "Attendence approved by Delivery",
  "Service Month (MM/YYYY)", "Remarks",
];

const PROJECT_HEADERS = [
  "Site Category", "Customer Name", "Partner Name", "Project Name", "Project Start Date (MM/DD/YYYY)",
  "Project End Date (MM/DD/YYYY)", "Country", "State", "City", "Site Address", "Zip Code", "PO Number",
  "Technician name", "Band", "Variant", "Number of working days", "Number of worked days", "Monthly rate",
  "Actual Cost", "OT Hours", "OT per Hour Rate", "OT Hours cost", "Weekened OT Hours", "Weekend Rate",
  "Weekend Cost", "Travel/extra cost if applicable as per contract", "Total Cost", "Tax % ", "Tax cost",
  "Total Cost including Tax", "Currency", "SLA %", "SLA Met", "Reason for SLA not met(if applicable)",
  "Attendence approved by Delivery", "Service Month (MM/YYYY)", "Remarks",
];

const DISPATCH_HEADERS = [
  "Site Category", "Customer Name", "Partner Name", "Customer Ticket Number",
  "Customer Ticket Created Date (MM/DD/YYYY)", "Partner Ticket Number", "Source of Request", "PO number",
  "Country", "State", "City", "Site Address", "Zip code", "Activity Details", "Dispatch Category",
  "Ticket Priority ", "ETA Date (MM/DD/YYYY)", "ETA Time (HH:MM)", "Technician Name",
  "Technician IN Date  (MM/DD/YYYY)", "Technician IN Time", "Technician OUT Time", "Total Hours",
  "First Hour", "First Hour rate", "First Hour cost", "Hours worked after First Hour", "After First Hours rate",
  "After First Hour cost", "OT Hours", "OT Hours rate", "OT Hours Cost", "Out of office Hours",
  "Out of Office Hours Rate", "Out of office Hours Cost", "Weekened OT Hours", "Weekend Rates", "Weekend Cost",
  "Travel/extra cost if applicable as per contract", "Total Cost", "Tax % ", "Tax cost",
  "Total Cost including Tax", "Currency", "SLA Met", "Reason for SLA not met(if applicable)",
  "CSR Report submitted", "Service Month (MM/YYYY)", "Remarks",
];

const SV_HEADERS = [
  "Site Category", "Customer Name", "Partner Name", "Customer Ticket Number",
  "Customer Ticket Created Date (MM/DD/YYYY)", "Partner Ticket Number", "Source of Request", "PO number",
  "Country", "State", "City", "Site Address", "Zip code", "Activity Details",
  "Category (Half day/Full Day/Per Hour)", "Weekend Rate (if applicable)", "ETA Date (MM/DD/YYYY)",
  "ETA Time (HH:MM)", "Technician Name", "Technician IN Date  (MM/DD/YYYY)", "Technician IN Time",
  "Technician OUT Time", "Total Hours", "Half Day Rate", "Full Date Rate", "Per Hour rate",
  "Out of office Hours", "Out of Office Hours Rate", "Out of office Hours Cost",
  "Travel/extra cost if applicable as per contract", "Total Cost", "Tax % ", "Tax cost",
  "Total Cost including Tax", "Currency", "SLA Met", "Reason for SLA not met(if applicable)",
  "Service Month (MM/YYYY)", "Remarks",
];

export async function renderFsoWorkbook(meta: FsoMeta, data: FsoData): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Ovation WPS";
  const { customerName: cust, currency: cur, serviceMonth: sm } = meta;

  // Dedicated
  writeSheet(
    wb,
    "Dedicated",
    DEDICATED_HEADERS,
    data.dedicated.map((r) => {
      const total = r.actualCost + r.otCost + r.weekendCost;
      return [
        "Dedicated", cust, PARTNER, r.country, r.state, r.city, r.street, r.zip, "",
        r.technicianName, r.band, r.variant, r.workingDays, r.workedDays, r.monthlyRate, r.actualCost,
        r.otHours, r.otRate, r.otCost, r.weekendHours, r.weekendRate, r.weekendCost, 0, total,
        0, 0, total, cur, "", "Yes", "NA", "Yes", sm, r.remarks,
      ];
    }),
  );

  // Project Work
  writeSheet(
    wb,
    "Project Work",
    PROJECT_HEADERS,
    data.project.map((r) => {
      const total = r.actualCost + r.otCost + r.weekendCost;
      return [
        "Project Work", cust, PARTNER, "", "", "", r.country, r.state, r.city, r.street, r.zip, "",
        r.technicianName, r.band, r.variant, r.workingDays, r.workedDays, r.monthlyRate, r.actualCost,
        r.otHours, r.otRate, r.otCost, r.weekendHours, r.weekendRate, r.weekendCost, 0, total,
        0, 0, total, cur, "", "Yes", "NA", "Yes", sm, r.remarks,
      ];
    }),
  );

  // Dispatch
  writeSheet(
    wb,
    "Dispatch",
    DISPATCH_HEADERS,
    data.dispatch.map((r) => {
      const contact = [r.technicianName, r.phone, r.email].filter(Boolean).join("\n");
      return [
        "Dispatch", cust, PARTNER, "NA", "", r.ticketNumber, "Ticketing Tool", "", r.country, r.state, r.city,
        r.street, r.zip, "Desktop Support", r.slaCode, "", r.visitDate, "", contact, r.visitDate, "", "",
        r.totalHours, 1, r.firstHourRate, r.firstHourCost, r.additionalHours, r.additionalHourRate,
        r.additionalHourCost, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, r.charge, 0, 0, r.charge, cur, "Yes", "NA", "Yes",
        sm, "",
      ];
    }),
  );

  // SV, Full & Half day Visit
  writeSheet(
    wb,
    "SV,Full & Half day Visit",
    SV_HEADERS,
    data.scheduled.map((r) => [
      "Schedule Visits", cust, PARTNER, "NA", "NA", "NA", "Email", "", r.country, r.state, r.city, r.street,
      r.zip, "Desktop Support", r.category, 0, "NA", "", r.technicianName, r.visitDate, "", "", "",
      r.halfDayRate, r.fullDayRate, 0, 0, 0, 0, 0, r.totalCost, 0, 0, r.totalCost, cur, "Yes", "NA", sm, "",
    ]),
  );

  const arrayBuffer = await wb.xlsx.writeBuffer();
  return Buffer.from(arrayBuffer);
}
