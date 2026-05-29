import { z } from "zod";

const code = z
  .string()
  .trim()
  .min(1)
  .max(30)
  .regex(/^[A-Z0-9_]+$/, "Uppercase letters, digits, and underscores only");

export const visitTypeCreateSchema = z.object({
  code,
  label: z.string().trim().min(1).max(80),
  sortOrder: z.coerce.number().int().min(0).max(9999).optional().default(0),
});

export const visitTypeUpdateSchema = visitTypeCreateSchema.extend({
  id: z.string().min(1),
});
