import { z } from "zod";
import { RateCategory } from "@prisma/client";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "YYYY-MM-DD");

// slaTier is no longer user input: it is derived from the technician's backfill
// trait (deriveAssignmentSlaTier) at create time.
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
  );

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
  );

export type AssignmentBulkCreateInput = z.infer<typeof assignmentBulkCreateSchema>;
