import { z } from "zod";
import { RateCategory } from "@prisma/client";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "YYYY-MM-DD");

// slaTier is no longer user input: it is derived from the technician's backfill
// trait (deriveAssignmentSlaTier) at create time.
// Only DEDICATED (ongoing FTE) may be open-ended. Project / Scheduled / Dispatch
// are bounded engagements that must carry an end date, so they only appear on the
// timesheet / invoice for the months inside their date range.
function requireEndForNonDedicated(v: { rateCategory: RateCategory; endDate?: string }): boolean {
  return v.rateCategory === RateCategory.DEDICATED || Boolean(v.endDate);
}
const END_REQUIRED_MESSAGE =
  "End date is required for Project / Scheduled / Dispatch assignments (only Dedicated is open-ended).";

export const assignmentCreateSchema = z
  .object({
    technicianId: z.string().min(1),
    clientAccountId: z.string().min(1),
    rateCategory: z.nativeEnum(RateCategory),
    startDate: isoDate,
    endDate: z
      .union([isoDate, z.literal("").transform(() => undefined)])
      .optional(),
  })
  .refine(
    (v) => !v.endDate || v.endDate > v.startDate,
    { path: ["endDate"], message: "End date must be after start date" },
  )
  .refine(requireEndForNonDedicated, { path: ["endDate"], message: END_REQUIRED_MESSAGE });

export type AssignmentCreateInput = z.infer<typeof assignmentCreateSchema>;

// Bulk variant: assign many technicians to one account at the same category /
// period in one action. Each assignment's tier is derived per technician.
export const assignmentBulkCreateSchema = z
  .object({
    technicianIds: z.array(z.string().min(1)).min(1, "Select at least one technician"),
    clientAccountId: z.string().min(1),
    rateCategory: z.nativeEnum(RateCategory),
    startDate: isoDate,
    endDate: z
      .union([isoDate, z.literal("").transform(() => undefined)])
      .optional(),
  })
  .refine(
    (v) => !v.endDate || v.endDate > v.startDate,
    { path: ["endDate"], message: "End date must be after start date" },
  )
  .refine(requireEndForNonDedicated, { path: ["endDate"], message: END_REQUIRED_MESSAGE });

export type AssignmentBulkCreateInput = z.infer<typeof assignmentBulkCreateSchema>;
