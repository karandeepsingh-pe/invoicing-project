import { z } from "zod";
import { TechType } from "@prisma/client";

export const technicianCreateSchema = z.object({
  employerOrgId: z.string().min(1),
  name: z.string().trim().min(2).max(120),
  primaryType: z.nativeEnum(TechType),
});

export type TechnicianCreateInput = z.infer<typeof technicianCreateSchema>;
