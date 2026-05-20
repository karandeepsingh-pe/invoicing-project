import { z } from "zod";
import { RateCategory } from "@prisma/client";

export const technicianCreateSchema = z.object({
  employerOrgId: z.string().min(1),
  firstName: z.string().trim().min(1).max(80),
  lastName: z.string().trim().min(1).max(80),
  primaryCategory: z.nativeEnum(RateCategory),
  band: z.coerce.number().int().min(0).max(4),
  initialAccountId: z.string().optional(),
  initialCategory: z.nativeEnum(RateCategory).optional(),
  initialStartDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD")
    .optional(),
});

export type TechnicianCreateInput = z.infer<typeof technicianCreateSchema>;

export const technicianUpdateSchema = z.object({
  id: z.string().min(1),
  employerOrgId: z.string().min(1),
  firstName: z.string().trim().min(1).max(80),
  lastName: z.string().trim().min(1).max(80),
  primaryCategory: z.nativeEnum(RateCategory),
  band: z.coerce.number().int().min(0).max(4),
  active: z.coerce.boolean().optional().default(true),
});

export type TechnicianUpdateInput = z.infer<typeof technicianUpdateSchema>;
