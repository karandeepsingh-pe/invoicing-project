import { z } from "zod";
import { MiscFeeKind } from "@prisma/client";

const optionalDecimal = z
  .union([
    z.coerce.number().nonnegative().max(10_000_000),
    z.literal("").transform(() => undefined),
  ])
  .optional();

export const miscFeeCreateSchema = z.object({
  clientAccountId: z.string().min(1),
  kind: z.nativeEnum(MiscFeeKind),
  label: z.string().trim().min(1).max(120),
  amount: optionalDecimal,
  notes: z
    .union([z.string().trim().max(500), z.literal("").transform(() => undefined)])
    .optional(),
});

export type MiscFeeCreateInput = z.infer<typeof miscFeeCreateSchema>;
