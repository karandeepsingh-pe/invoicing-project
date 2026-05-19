import { z } from "zod";
import { OutputTemplate } from "@prisma/client";

export const orgCreateSchema = z.object({
  name: z.string().trim().min(2).max(80),
  outputTemplate: z.nativeEnum(OutputTemplate),
  defaultCurrency: z
    .string()
    .trim()
    .length(3)
    .regex(/^[A-Z]{3}$/, "ISO 4217 currency code (e.g. USD)")
    .default("USD"),
});

export type OrgCreateInput = z.infer<typeof orgCreateSchema>;
