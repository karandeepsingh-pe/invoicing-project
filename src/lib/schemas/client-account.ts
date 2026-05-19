import { z } from "zod";

export const clientAccountCreateSchema = z.object({
  orgId: z.string().min(1),
  name: z.string().trim().min(1).max(120),
  currency: z
    .string()
    .trim()
    .length(3)
    .regex(/^[A-Z]{3}$/, "ISO 4217 currency code (e.g. USD)")
    .optional()
    .or(z.literal("").transform(() => undefined)),
});

export type ClientAccountCreateInput = z.infer<typeof clientAccountCreateSchema>;
