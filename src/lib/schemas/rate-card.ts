import { z } from "zod";
import { RateUnit, TechType } from "@prisma/client";

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "YYYY-MM-DD");

const optionalIsoDate = z
  .union([isoDate, z.literal("").transform(() => undefined)])
  .optional();

export const rateCardCreateSchema = z
  .object({
    clientAccountId: z.string().min(1),
    techType: z.nativeEnum(TechType),
    rateUnit: z.nativeEnum(RateUnit),
    rateAmount: z.coerce.number().positive().max(1_000_000),
    otRate: z
      .union([z.coerce.number().nonnegative().max(1_000_000), z.literal("").transform(() => undefined)])
      .optional(),
    effectiveFrom: isoDate,
    effectiveTo: optionalIsoDate,
  })
  .refine(
    (v) => !v.effectiveTo || v.effectiveTo > v.effectiveFrom,
    { path: ["effectiveTo"], message: "Effective-to must be after effective-from" },
  );

export type RateCardCreateInput = z.infer<typeof rateCardCreateSchema>;
