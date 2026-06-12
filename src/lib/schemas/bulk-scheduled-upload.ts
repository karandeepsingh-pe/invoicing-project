import { z } from "zod";

// Template columns for the scheduled-visit bulk upload. INPUTS ONLY — each
// row becomes a TimesheetEntry on the technician's SCHEDULED assignment and
// is priced at invoice time from the account's FULL_DAY / HALF_DAY rate rows,
// exactly like grid-entered scheduled days.
export const BULK_SCHEDULED_COLUMNS = [
  { key: "technician", header: "Technician *" },
  { key: "visitDate", header: "Visit Date * (YYYY-MM-DD)" },
  { key: "dayType", header: "Day Type * (FULL / HALF / hours e.g. 3)" },
  { key: "notes", header: "Notes (not billed)" },
] as const;

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "use YYYY-MM-DD");

const DAY_TYPE_SYNONYMS: Record<string, "FULL" | "HALF"> = {
  full: "FULL",
  "full day": "FULL",
  fullday: "FULL",
  f: "FULL",
  half: "HALF",
  "half day": "HALF",
  halfday: "HALF",
  h: "HALF",
};

/** FULL, HALF, or an hour count (bills hours × the SCHEDULED hourly rate). */
export type ScheduledDayType =
  | { kind: "FULL" }
  | { kind: "HALF" }
  | { kind: "HOURS"; hours: number };

export const bulkScheduledRowSchema = z.object({
  technician: z.string().trim().min(1, "Technician is required"),
  visitDate: z.string().trim().pipe(isoDate),
  dayType: z.string().transform((v, ctx): ScheduledDayType => {
    const s = v.trim().toLowerCase();
    const word = DAY_TYPE_SYNONYMS[s];
    if (word) return { kind: word };
    const n = Number(s);
    if (Number.isFinite(n) && n > 0 && n < 24) return { kind: "HOURS", hours: n };
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "use FULL, HALF, or an hour count (0–24, e.g. 3)",
    });
    return z.NEVER;
  }),
  notes: z.string().transform((v) => {
    const t = v.trim();
    return t === "" ? undefined : t;
  }),
});

export type BulkScheduledRow = z.infer<typeof bulkScheduledRowSchema>;
