import { z } from "zod";

// Template columns for the scheduled-visit bulk upload. INPUTS ONLY — each
// row becomes a TimesheetEntry on the technician's SCHEDULED assignment and
// is priced at invoice time from the account's FULL_DAY / HALF_DAY rate rows,
// exactly like grid-entered scheduled days.
export const BULK_SCHEDULED_COLUMNS = [
  { key: "technician", header: "Technician *" },
  { key: "visitDate", header: "Visit Date * (YYYY-MM-DD)" },
  { key: "dayType", header: "Day Type * (FULL / HALF)" },
  { key: "notes", header: "Notes (not billed)" },
] as const;

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "use YYYY-MM-DD");

const DAY_TYPE_SYNONYMS: Record<string, "FULL" | "HALF"> = {
  full: "FULL",
  "full day": "FULL",
  fullday: "FULL",
  f: "FULL",
  "1": "FULL",
  half: "HALF",
  "half day": "HALF",
  halfday: "HALF",
  h: "HALF",
  "0.5": "HALF",
};

export const bulkScheduledRowSchema = z.object({
  technician: z.string().trim().min(1, "Technician is required"),
  visitDate: z.string().trim().pipe(isoDate),
  dayType: z.string().transform((v, ctx) => {
    const t = DAY_TYPE_SYNONYMS[v.trim().toLowerCase()];
    if (!t) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "use FULL or HALF" });
      return z.NEVER;
    }
    return t;
  }),
  notes: z.string().transform((v) => {
    const t = v.trim();
    return t === "" ? undefined : t;
  }),
});

export type BulkScheduledRow = z.infer<typeof bulkScheduledRowSchema>;
