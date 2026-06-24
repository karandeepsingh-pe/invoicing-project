import { z } from "zod";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "YYYY-MM-DD");

// Covering side is technician-based (2026-06-10): any active pool tech, no
// account assignment needed. The covered side stays an assignment (the seat).
export const coverageCreateSchema = z.object({
  coveredAssignmentId: z.string().min(1),
  coveringTechnicianId: z.string().min(1),
  date: isoDate,
  hours: z.coerce.number().min(0.25).max(24),
  // Pass-through expense paid to the covering tech (travel etc.) — billed to
  // the client under Reimbursements. Blank -> none.
  expenseAmount: z.preprocess(
    (v) => (v === "" || v === null || v === undefined ? undefined : v),
    z.coerce.number().min(0).max(100_000).optional(),
  ),
  expenseNotes: z
    .string()
    .trim()
    .max(120)
    .transform((v) => (v.length === 0 ? null : v))
    .nullable()
    .optional(),
  notes: z
    .string()
    .trim()
    .max(500)
    .transform((v) => (v.length === 0 ? null : v))
    .nullable()
    .optional(),
});

export type CoverageCreateInput = z.infer<typeof coverageCreateSchema>;

export const coverageDeleteSchema = z.object({ id: z.string().min(1) });
