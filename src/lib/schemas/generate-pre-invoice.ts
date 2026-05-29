import { z } from "zod";

// OT and Weekend Hours are derived from the timesheet cells now; the
// generator no longer accepts per-tech overrides.
export const generatePreInvoiceSchema = z.object({
  accountId: z.string().min(1),
  year: z.coerce.number().int().min(2000).max(2100),
  month: z.coerce.number().int().min(1).max(12),
  // Per-run business days (varies by month, e.g. 21 Apr / 22 Mar). Used to
  // prorate annual-rate FTEs. Omitted -> the engine uses the computed default.
  businessDays: z.coerce.number().int().min(1).max(31).optional(),
});

export type GeneratePreInvoiceInput = z.infer<typeof generatePreInvoiceSchema>;
