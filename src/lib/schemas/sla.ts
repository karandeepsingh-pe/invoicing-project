import { z } from "zod";

export const slaCreateSchema = z.object({
  code: z
    .string()
    .trim()
    .min(1)
    .max(20)
    .regex(/^[A-Z0-9_-]+$/i, "Use letters, digits, dash or underscore only")
    .transform((s) => s.toUpperCase()),
  label: z.string().trim().min(1).max(80),
  sortOrder: z.coerce.number().int().min(0).max(9999).default(0),
});

export type SlaCreateInput = z.infer<typeof slaCreateSchema>;

export const slaUpdateSchema = slaCreateSchema.extend({
  id: z.string().min(1),
});

export type SlaUpdateInput = z.infer<typeof slaUpdateSchema>;
