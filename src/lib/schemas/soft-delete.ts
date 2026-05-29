import { z } from "zod";
import { RateCategory } from "@prisma/client";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD");
const yearField = z.coerce.number().int().min(2000).max(2100);
const monthField = z.coerce.number().int().min(1).max(12);

// Soft-delete a single day cell for one assignment.
export const softDeleteCellSchema = z.object({
  assignmentId: z.string().min(1),
  date: isoDate,
});

// Soft-delete an entire technician row (one assignment) for a month.
export const softDeleteRowMonthSchema = z.object({
  assignmentId: z.string().min(1),
  year: yearField,
  month: monthField,
});

// Soft-delete an entire month for an account + invoice-type combination.
export const softDeleteAccountTypeMonthSchema = z.object({
  accountId: z.string().min(1),
  rateCategory: z.nativeEnum(RateCategory),
  year: yearField,
  month: monthField,
});

// Soft-delete (or restore) a single dispatch visit by id.
export const softDeleteIdSchema = z.object({ id: z.string().min(1) });
