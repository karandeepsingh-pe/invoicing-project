import { z } from "zod";
import { TimesheetDayStatus } from "@prisma/client";

const dayCellSchema = z
  .object({
    assignmentId: z.string().min(1),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD"),
    hours: z.number().min(0).max(24).nullable(),
    status: z.nativeEnum(TimesheetDayStatus).nullable(),
  })
  // A cell must carry either a numeric hours value OR a status code — never
  // both null. The client builds the payload to honour this; the refinement
  // guards a tampered or stale post.
  .refine((c) => c.hours !== null || c.status !== null, {
    message: "Cell must have either an hours value or a status code.",
  });

export const saveTimesheetMonthSchema = z.object({
  accountId: z.string().min(1),
  year: z.coerce.number().int().min(2000).max(2100),
  month: z.coerce.number().int().min(1).max(12),
  cells: z.array(dayCellSchema),
});

export type SaveTimesheetMonthInput = z.infer<typeof saveTimesheetMonthSchema>;
export type DayCellInput = z.infer<typeof dayCellSchema>;

// Incremental (autosave) save of a set of individual cells. Each cell either
// carries a value/status (upsert) or `clear: true` (soft-delete that one cell).
// Unlike the month save, this never touches cells not in the payload and has no
// whole-month completeness gate.
const cellSaveSchema = z
  .object({
    assignmentId: z.string().min(1),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD"),
    hours: z.number().min(0).max(24).nullable().optional(),
    status: z.nativeEnum(TimesheetDayStatus).nullable().optional(),
    clear: z.boolean().optional(),
  })
  .refine((c) => c.clear === true || c.hours != null || c.status != null, {
    message: "A cell must carry hours, a status, or clear=true.",
  });

export const saveTimesheetCellsSchema = z.object({
  accountId: z.string().min(1),
  cells: z.array(cellSaveSchema).min(1).max(1000),
});

export type SaveTimesheetCellsInput = z.infer<typeof saveTimesheetCellsSchema>;
