import { z } from "zod";
import { OutputTemplate } from "@prisma/client";

const currencyCode = z
  .string()
  .trim()
  .length(3)
  .regex(/^[A-Z]{3}$/, "ISO 4217 currency code (e.g. USD)");

// Remittance bill-to fields: blank → null (falls back to the HCL default or the
// account address on the Remittance Advice sheet).
const optionalText = (max: number) =>
  z.preprocess(
    (v) => {
      const s = typeof v === "string" ? v.trim() : "";
      return s === "" ? null : s;
    },
    z.string().max(max).nullable(),
  );

const remitFields = {
  remitClientCode: optionalText(40),
  remitClientName: optionalText(120),
  remitClientAddress: optionalText(400),
};

export const orgCreateSchema = z.object({
  name: z.string().trim().min(2).max(80),
  outputTemplate: z.nativeEnum(OutputTemplate),
  defaultCurrency: currencyCode.default("USD"),
  ...remitFields,
});

export type OrgCreateInput = z.infer<typeof orgCreateSchema>;

export const orgUpdateSchema = z.object({
  id: z.string().min(1),
  name: z.string().trim().min(2).max(80),
  outputTemplate: z.nativeEnum(OutputTemplate),
  defaultCurrency: currencyCode.default("USD"),
  ...remitFields,
});

export type OrgUpdateInput = z.infer<typeof orgUpdateSchema>;
