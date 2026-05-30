import { z } from "zod";

const isoDate = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD");

export const holidayCreateSchema = z.object({
  date: isoDate,
  name: z.string().trim().min(1).max(80),
});

export type HolidayCreateInput = z.infer<typeof holidayCreateSchema>;

export const holidayUpdateSchema = holidayCreateSchema.extend({
  id: z.string().min(1),
});

export type HolidayUpdateInput = z.infer<typeof holidayUpdateSchema>;
