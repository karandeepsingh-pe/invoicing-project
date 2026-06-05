import { z } from "zod";
import { DispatchPricingModel, DedicatedBillingBasis } from "@prisma/client";

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

// Dispatch business-hours window time ("HH:mm"), or null/blank = unset.
const hhmmOrNull = z
  .union([
    z.string().trim().regex(/^\d{2}:\d{2}$/, "HH:mm"),
    z.literal("").transform(() => null),
  ])
  .nullable()
  .optional();

// Shared dispatch-billing knobs (added to create + update). No schema default so
// programmatic fixtures that omit them keep the window null (auto-split off).
const dispatchBillingFields = {
  dispatchPricingModel: z.nativeEnum(DispatchPricingModel).optional(),
  dedicatedBillingBasis: z.nativeEnum(DedicatedBillingBasis).optional(),
  businessHoursStart: hhmmOrNull,
  businessHoursEnd: hhmmOrNull,
};

// Both window ends must be set together, and end after start (string compare is
// valid for same-format "HH:mm"). Applied to create + update.
function refineBusinessHours(
  val: { businessHoursStart?: string | null; businessHoursEnd?: string | null },
  ctx: z.RefinementCtx,
): void {
  const s = val.businessHoursStart;
  const e = val.businessHoursEnd;
  const has = (x: string | null | undefined): x is string => x != null && x !== "";
  if (has(s) !== has(e)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["businessHoursEnd"],
      message: "Set both business-hours start and end, or neither.",
    });
    return;
  }
  if (has(s) && has(e) && e <= s) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["businessHoursEnd"],
      message: "Business-hours end must be after start.",
    });
  }
}

// Billing / site address. Stored as plain nullable text columns (no postal-code
// master FK — that master is for technician/dispatch geography).
const addressFields = {
  addressLine1: optionalText(120),
  city: optionalText(80),
  state: optionalText(80),
  postalCode: optionalText(12),
  country: optionalText(80),
};

export const clientAccountCreateSchema = z
  .object({
    orgId: z.string().min(1),
    name: z.string().trim().min(1).max(120),
    currency: currencyField,
    clientPocName: optionalText(120),
    clientSpocEmail: emailOrEmpty,
    projectDescription: optionalText(200),
    defaultHours: defaultHoursField,
    ...addressFields,
    ...dispatchBillingFields,
  })
  .superRefine(refineBusinessHours);

export type ClientAccountCreateInput = z.infer<typeof clientAccountCreateSchema>;

export const clientAccountUpdateSchema = z
  .object({
    id: z.string().min(1),
    name: z.string().trim().min(1).max(120),
    currency: currencyField,
    clientPocName: optionalText(120),
    clientSpocEmail: emailOrEmpty,
    projectDescription: optionalText(200),
    defaultHours: defaultHoursField,
    ...addressFields,
    ...dispatchBillingFields,
  })
  .superRefine(refineBusinessHours);

export type ClientAccountUpdateInput = z.infer<typeof clientAccountUpdateSchema>;
