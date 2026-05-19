import { z } from "zod";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "YYYY-MM-DD");
const optionalIsoDate = z
  .union([isoDate, z.literal("").transform(() => undefined)])
  .optional();

const optionalDecimal = z
  .union([
    z.coerce.number().nonnegative().max(10_000_000),
    z.literal("").transform(() => undefined),
  ])
  .optional();

export const accountRateCreateSchema = z
  .object({
    clientAccountId: z.string().min(1),
    rateSubCategoryId: z.string().min(1),
    band: z.coerce.number().int().min(0).max(4),
    slaId: z.string().min(1),
    rateAmount: optionalDecimal,
    effectiveFrom: isoDate,
    effectiveTo: optionalIsoDate,
    notes: z
      .union([z.string().trim().max(500), z.literal("").transform(() => undefined)])
      .optional(),
  })
  .refine(
    (v) => !v.effectiveTo || v.effectiveTo > v.effectiveFrom,
    { path: ["effectiveTo"], message: "Effective-to must be after effective-from" },
  );

export type AccountRateCreateInput = z.infer<typeof accountRateCreateSchema>;

export const accountRateUpdateAmountSchema = z.object({
  id: z.string().min(1),
  rateAmount: optionalDecimal,
});
