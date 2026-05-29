import { z } from "zod";

const optionalDecimal = z
  .union([
    z.coerce.number().nonnegative().max(10_000_000),
    z.literal("").transform(() => undefined),
  ])
  .optional();

// Rates are edited in place (one row per sub-category × band × SLA), so the
// create form no longer collects effective dates — the action sets a fixed
// "always active" window. See createAccountRate.
export const accountRateCreateSchema = z.object({
  clientAccountId: z.string().min(1),
  rateSubCategoryId: z.string().min(1),
  band: z.coerce.number().int().min(0).max(4),
  slaId: z.string().min(1),
  rateAmount: optionalDecimal,
  notes: z
    .union([z.string().trim().max(500), z.literal("").transform(() => undefined)])
    .optional(),
});

export type AccountRateCreateInput = z.infer<typeof accountRateCreateSchema>;

export const accountRateUpdateAmountSchema = z.object({
  id: z.string().min(1),
  rateAmount: optionalDecimal,
});
