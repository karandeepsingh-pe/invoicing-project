import { z } from "zod";
import { RateCategory } from "@prisma/client";

export const technicianCreateSchema = z.object({
  employerOrgId: z.string().min(1),
  firstName: z.string().trim().min(1).max(80),
  lastName: z.string().trim().min(1).max(80),
  primaryCategory: z.nativeEnum(RateCategory),
  band: z.coerce.number().int().min(0).max(4),
});

export type TechnicianCreateInput = z.infer<typeof technicianCreateSchema>;
