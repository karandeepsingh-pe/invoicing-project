import { z } from "zod";

// OT and Weekend Hours are derived from the timesheet cells now; the
// generator no longer accepts per-tech overrides.
export const generatePreInvoiceSchema = z.object({
  accountId: z.string().min(1),
  year: z.coerce.number().int().min(2000).max(2100),
  month: z.coerce.number().int().min(1).max(12),
});

export type GeneratePreInvoiceInput = z.infer<typeof generatePreInvoiceSchema>;
