import { z } from "zod";
import { TechType } from "@prisma/client";

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "YYYY-MM-DD");

export const assignmentCreateSchema = z
  .object({
    technicianId: z.string().min(1),
    clientAccountId: z.string().min(1),
    techType: z.nativeEnum(TechType),
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
