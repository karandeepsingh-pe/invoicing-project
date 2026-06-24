import { z } from "zod";
import { DispatchWorkStatus } from "@prisma/client";
import { parseYesNo } from "@/lib/domain/bulk-cells";

// Template columns for the dispatch-visit bulk upload, in sheet order.
// INPUTS ONLY: charges are computed at invoice time from the account's rate
// sheet (first hour + additional hours, business/OOB/weekend split, TCS
// priority model) exactly as for manually-entered visits.
export const BULK_DISPATCH_COLUMNS = [
  { key: "technician", header: "Technician *" },
  { key: "visitDate", header: "Visit Date * (YYYY-MM-DD)" },
  { key: "ticketNumber", header: "Ticket Number" },
  { key: "slaCode", header: "SLA Code *" },
  { key: "visitType", header: "Visit Type" },
  { key: "workStatus", header: "Work Status" },
  { key: "cancellationCharge", header: "Cancellation Charge $ (Cancelled only)" },
  { key: "inTime", header: "In-Time (HH:mm)" },
  { key: "outTime", header: "Out-Time (HH:mm)" },
  { key: "totalHours", header: "Total Hours (blank = from In/Out)" },
  { key: "oooHrs", header: "OOO Hrs" },
  { key: "afterHours", header: "After Hours (Y/N)" },
  { key: "weekend", header: "Weekend (Y/N)" },
  { key: "siteCode", header: "Site Code" },
  { key: "siteLocation", header: "Street / Site Location" },
  { key: "zipcode", header: "Zipcode" },
  { key: "city", header: "City" },
  { key: "state", header: "State" },
  { key: "country", header: "Country" },
  { key: "requestReceivedDate", header: "Request Received (YYYY-MM-DD)" },
  { key: "proposedOnsiteDate", header: "Proposed Onsite (YYYY-MM-DD)" },
  { key: "visitTime", header: "Proposed Time (HH:mm)" },
  { key: "travelHours", header: "Travel Hours" },
  { key: "travelMiles", header: "Travel Miles" },
  { key: "partsAmount", header: "Parts $" },
  { key: "reimbursementNotes", header: "Reimbursement Notes" },
  { key: "notes", header: "Notes" },
  { key: "overrideConflict", header: "Override Conflict (Y/N)" },
  { key: "overrideReason", header: "Override Reason" },
] as const;

export type BulkDispatchColumnKey = (typeof BULK_DISPATCH_COLUMNS)[number]["key"];

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "use YYYY-MM-DD");
const hhmm = z.string().regex(/^\d{2}:\d{2}$/, "use HH:mm (24h)");

const optIsoDate = z
  .string()
  .transform((v) => v.trim())
  .pipe(isoDate.or(z.literal("").transform(() => undefined)));

const optHhmm = z
  .string()
  .transform((v) => v.trim())
  .pipe(hhmm.or(z.literal("").transform(() => undefined)));

const optNumber = (max: number) =>
  z
    .string()
    .trim()
    .transform((v, ctx) => {
      if (v === "") return undefined;
      const n = Number(v);
      if (!Number.isFinite(n) || n < 0 || n > max) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, message: `must be a number 0–${max}` });
        return z.NEVER;
      }
      return n;
    });

const optText = z.string().transform((v) => {
  const t = v.trim();
  return t === "" ? undefined : t;
});

function yesNo(defaultValue: boolean) {
  return z.string().transform((v, ctx) => {
    const b = parseYesNo(v, defaultValue);
    if (b === null) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "use Y or N" });
      return z.NEVER;
    }
    return b;
  });
}

const WORK_STATUS_SYNONYMS: Record<string, DispatchWorkStatus> = {
  "": DispatchWorkStatus.COMPLETED,
  completed: DispatchWorkStatus.COMPLETED,
  complete: DispatchWorkStatus.COMPLETED,
  cancelled: DispatchWorkStatus.CANCELLED,
  canceled: DispatchWorkStatus.CANCELLED,
  rescheduled: DispatchWorkStatus.RESCHEDULED,
  "no-show": DispatchWorkStatus.NO_SHOW,
  "no show": DispatchWorkStatus.NO_SHOW,
  no_show: DispatchWorkStatus.NO_SHOW,
  pending: DispatchWorkStatus.PENDING,
};

/**
 * Hours between two "HH:mm" wall-clock times, 2dp. Out ≤ In means the visit
 * crossed midnight (overnight ticket) and wraps into the next day.
 */
export function hoursBetween(inTime: string, outTime: string): number {
  const [ih, im] = inTime.split(":").map(Number);
  const [oh, om] = outTime.split(":").map(Number);
  let minutes = oh * 60 + om - (ih * 60 + im);
  if (minutes <= 0) minutes += 24 * 60;
  return Math.round((minutes / 60) * 100) / 100;
}

/**
 * Row schema for the bulk sheet. Produces a typed intermediate; the action
 * resolves names/codes to ids and funnels the result through the SAME
 * `dispatchVisitCreateSchema` + create core the manual form uses, so bulk
 * rows obey identical rules (In/Out pairing, business-hours requirement,
 * booking conflicts, …).
 */
export const bulkDispatchRowSchema = z
  .object({
    technician: z.string().trim().min(1, "Technician is required"),
    visitDate: z.string().trim().pipe(isoDate),
    ticketNumber: optText,
    slaCode: z.string().trim().min(1, "SLA Code is required"),
    visitType: optText,
    workStatus: z.string().transform((v, ctx) => {
      const status = WORK_STATUS_SYNONYMS[v.trim().toLowerCase()];
      if (!status) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "use Completed / Cancelled / Rescheduled / No-show / Pending",
        });
        return z.NEVER;
      }
      return status;
    }),
    cancellationCharge: optNumber(9_999_999),
    inTime: optHhmm,
    outTime: optHhmm,
    totalHours: optNumber(24),
    oooHrs: optNumber(24),
    afterHours: yesNo(false),
    weekend: yesNo(false),
    siteCode: optText,
    siteLocation: optText,
    zipcode: optText,
    city: optText,
    state: optText,
    country: optText,
    requestReceivedDate: optIsoDate,
    proposedOnsiteDate: optIsoDate,
    visitTime: optHhmm,
    travelHours: optNumber(99),
    travelMiles: optNumber(99999),
    partsAmount: optNumber(9_999_999),
    reimbursementNotes: optText,
    notes: optText,
    overrideConflict: yesNo(false),
    overrideReason: optText,
  })
  .superRefine((row, ctx) => {
    if (row.cancellationCharge !== undefined && row.workStatus !== "CANCELLED") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["cancellationCharge"],
        message: "only valid when Work Status is Cancelled",
      });
    }
    if (Boolean(row.inTime) !== Boolean(row.outTime)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["outTime"],
        message: "enter both In-Time and Out-Time, or neither",
      });
    }
    // Out ≤ In is allowed: the ticket crossed midnight (overnight visit).
    if (row.totalHours === undefined && !(row.inTime && row.outTime)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["totalHours"],
        message: "enter Total Hours or an In/Out time pair",
      });
    }
  })
  .transform((row) => ({
    ...row,
    // Billing quantity: explicit Total Hours wins; otherwise derived from In/Out.
    // (The 0 branch is unreachable on valid rows — superRefine already rejected
    // rows with neither — but keeps the transform total-function safe.)
    hoursOnSite:
      row.totalHours ?? (row.inTime && row.outTime ? hoursBetween(row.inTime, row.outTime) : 0),
  }));

export type BulkDispatchRow = z.infer<typeof bulkDispatchRowSchema>;
