import { z } from "zod";
import { OutputTemplate, RateBasis } from "@prisma/client";

const currencyCode = z
  .string()
  .trim()
  .length(3)
  .regex(/^[A-Z]{3}$/, "ISO 4217 currency code (e.g. USD)");

// Org policy from <select> values. backfillAllowed submits "true"/"false";
// absent defaults to allowed. rateBasis submits the RateBasis enum.
const backfillAllowedField = z
  .union([z.literal("true"), z.literal("false")])
  .optional()
  .transform((v) => v !== "false");

const rateBasisField = z.nativeEnum(RateBasis).optional().default(RateBasis.DAY_RATE);

export const orgCreateSchema = z.object({
  name: z.string().trim().min(2).max(80),
  outputTemplate: z.nativeEnum(OutputTemplate),
  defaultCurrency: currencyCode.default("USD"),
  backfillAllowed: backfillAllowedField,
  rateBasis: rateBasisField,
});

export type OrgCreateInput = z.infer<typeof orgCreateSchema>;

export const orgUpdateSchema = z.object({
  id: z.string().min(1),
  name: z.string().trim().min(2).max(80),
  outputTemplate: z.nativeEnum(OutputTemplate),
  defaultCurrency: currencyCode.default("USD"),
  backfillAllowed: backfillAllowedField,
  rateBasis: rateBasisField,
});

export type OrgUpdateInput = z.infer<typeof orgUpdateSchema>;
