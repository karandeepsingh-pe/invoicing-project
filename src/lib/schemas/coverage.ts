import { z } from "zod";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "YYYY-MM-DD");

export const coverageCreateSchema = z
  .object({
    coveredAssignmentId: z.string().min(1),
    coveringAssignmentId: z.string().min(1),
    date: isoDate,
    hours: z.coerce.number().min(0.25).max(24),
    notes: z
      .string()
      .trim()
      .max(500)
      .transform((v) => (v.length === 0 ? null : v))
      .nullable()
      .optional(),
  })
  .refine((v) => v.coveredAssignmentId !== v.coveringAssignmentId, {
    path: ["coveringAssignmentId"],
    message: "Covering technician must differ from covered technician.",
  });

export type CoverageCreateInput = z.infer<typeof coverageCreateSchema>;

export const coverageDeleteSchema = z.object({ id: z.string().min(1) });
