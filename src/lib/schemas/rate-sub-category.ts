import { z } from "zod";
import { RateCategory } from "@prisma/client";

const codeSchema = z
  .string()
  .trim()
  .min(1)
  .max(40)
  .regex(/^[A-Z0-9_]+$/i, "Use letters, digits, or underscore only")
  .transform((s) => s.toUpperCase());

export const rateSubCategoryCreateSchema = z.object({
  rateCategory: z.nativeEnum(RateCategory),
  code: codeSchema,
  label: z.string().trim().min(1).max(80),
  sortOrder: z.coerce.number().int().min(0).max(9999).default(0),
  isOvertimeVariant: z.coerce.boolean().optional().default(false),
});

export type RateSubCategoryCreateInput = z.infer<typeof rateSubCategoryCreateSchema>;

export const rateSubCategoryUpdateSchema = rateSubCategoryCreateSchema.extend({
  id: z.string().min(1),
});

export type RateSubCategoryUpdateInput = z.infer<typeof rateSubCategoryUpdateSchema>;
