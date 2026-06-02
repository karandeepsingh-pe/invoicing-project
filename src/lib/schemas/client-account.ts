import { z } from "zod";

const currencyField = z
  .string()
  .trim()
  .length(3)
  .regex(/^[A-Z]{3}$/, "ISO 4217 currency code (e.g. USD)")
  .optional()
  .or(z.literal("").transform(() => undefined));

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => (v.length === 0 ? null : v))
    .nullable()
    .optional();

const emailOrEmpty = z
  .union([
    z.string().trim().email(),
    z.literal("").transform(() => null),
  ])
  .nullable()
  .optional();

const defaultHoursField = z.coerce.number().int().min(1).max(24).optional().default(8);

// Billing / site address. Stored as plain nullable text columns (no postal-code
// master FK — that master is for technician/dispatch geography).
const addressFields = {
  addressLine1: optionalText(120),
  city: optionalText(80),
  state: optionalText(80),
  postalCode: optionalText(12),
  country: optionalText(80),
};

export const clientAccountCreateSchema = z.object({
  orgId: z.string().min(1),
  name: z.string().trim().min(1).max(120),
  currency: currencyField,
  clientPocName: optionalText(120),
  clientSpocEmail: emailOrEmpty,
  projectDescription: optionalText(200),
  defaultHours: defaultHoursField,
  ...addressFields,
});

export type ClientAccountCreateInput = z.infer<typeof clientAccountCreateSchema>;

export const clientAccountUpdateSchema = z.object({
  id: z.string().min(1),
  name: z.string().trim().min(1).max(120),
  currency: currencyField,
  clientPocName: optionalText(120),
  clientSpocEmail: emailOrEmpty,
  projectDescription: optionalText(200),
  defaultHours: defaultHoursField,
  ...addressFields,
});

export type ClientAccountUpdateInput = z.infer<typeof clientAccountUpdateSchema>;
