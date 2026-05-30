import { z } from "zod";
import { OutputTemplate } from "@prisma/client";

const currencyCode = z
  .string()
  .trim()
  .length(3)
  .regex(/^[A-Z]{3}$/, "ISO 4217 currency code (e.g. USD)");

export const orgCreateSchema = z.object({
  name: z.string().trim().min(2).max(80),
  outputTemplate: z.nativeEnum(OutputTemplate),
  defaultCurrency: currencyCode.default("USD"),
});

export type OrgCreateInput = z.infer<typeof orgCreateSchema>;

export const orgUpdateSchema = z.object({
  id: z.string().min(1),
  name: z.string().trim().min(2).max(80),
  outputTemplate: z.nativeEnum(OutputTemplate),
  defaultCurrency: currencyCode.default("USD"),
});

export type OrgUpdateInput = z.infer<typeof orgUpdateSchema>;
