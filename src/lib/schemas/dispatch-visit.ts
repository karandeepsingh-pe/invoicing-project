import { z } from "zod";
import { DispatchWorkStatus } from "@prisma/client";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "YYYY-MM-DD");
const hhmm = z.string().regex(/^\d{2}:\d{2}$/, "HH:mm");

// "" -> null (stored as null)
const optText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => (v.length === 0 ? null : v))
    .nullable()
    .optional();

// "" -> undefined (for LocationFields, which feed resolvePostalCodeId)
const optStr = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => (v.length === 0 ? undefined : v))
    .optional();

// Shared visit fields — used by both create and update.
const visitFields = {
  assignmentId: z.string().min(1),
  visitDate: isoDate,
  requestReceivedDate: isoDate.optional().or(z.literal("").transform(() => undefined)),
  proposedOnsiteDate: isoDate.optional().or(z.literal("").transform(() => undefined)),
  visitTime: hhmm.optional().or(z.literal("").transform(() => undefined)), // proposed onsite time
  siteCode: optText(40),
  ticketNumber: optText(60), // Vantage Ticket (manual)
  hoursOnSite: z.coerce.number().min(0).max(24), // Total Hrs (manual)
  oooHrs: z.coerce.number().min(0).max(24).optional(),
  afterHours: z.coerce.boolean().optional().default(false),
  weekend: z.coerce.boolean().optional().default(false),
  workStatus: z.nativeEnum(DispatchWorkStatus).optional().default(DispatchWorkStatus.COMPLETED),
  // Manual cancellation fee — bills exactly this on a CANCELLED visit; a
  // CANCELLED visit without it is logged but never invoiced.
  cancellationCharge: z.coerce.number().min(0).max(9_999_999).optional(),
  slaId: z.string().min(1),
  visitTypeId: z.string().optional(),
  inTime: hhmm.optional().or(z.literal("").transform(() => undefined)),
  outTime: hhmm.optional().or(z.literal("").transform(() => undefined)),
  siteLocation: optText(160), // manual street line
  zipcode: optStr(12),
  locationCity: optStr(80),
  locationState: optStr(80),
  locationCountry: optStr(80),
  travelHours: z.coerce.number().min(0).max(99).optional(),
  travelMiles: z.coerce.number().min(0).max(99999).optional(),
  partsAmount: z.coerce.number().min(0).max(9_999_999).optional(),
  reimbursementNotes: optText(300),
  notes: optText(500),
  override: z.coerce.boolean().optional().default(false),
  overrideReason: optText(300),
} as const;

// Both In/Out present-or-absent together. Out ≤ In is ALLOWED and means the
// visit crossed midnight (overnight ticket): hours wrap to the next day and
// the post-midnight portion bills OOO/after-hours on auto-split accounts.
const inOutPaired = (v: { inTime?: string; outTime?: string }) =>
  Boolean(v.inTime) === Boolean(v.outTime);
// A cancellation fee only makes sense on a CANCELLED visit.
const cancellationOnlyWhenCancelled = (v: {
  workStatus: DispatchWorkStatus;
  cancellationCharge?: number;
}) => v.cancellationCharge === undefined || v.workStatus === DispatchWorkStatus.CANCELLED;

export const dispatchVisitCreateSchema = z
  .object(visitFields)
  .refine(inOutPaired, { path: ["outTime"], message: "Enter both In-Time and Out-Time, or leave both blank." })
  .refine(cancellationOnlyWhenCancelled, {
    path: ["cancellationCharge"],
    message: "Cancellation charge applies only when Work Status is Cancelled.",
  });

export type DispatchVisitCreateInput = z.infer<typeof dispatchVisitCreateSchema>;

export const dispatchVisitUpdateSchema = z
  .object({ id: z.string().min(1), ...visitFields })
  .refine(inOutPaired, { path: ["outTime"], message: "Enter both In-Time and Out-Time, or leave both blank." })
  .refine(cancellationOnlyWhenCancelled, {
    path: ["cancellationCharge"],
    message: "Cancellation charge applies only when Work Status is Cancelled.",
  });

export type DispatchVisitUpdateInput = z.infer<typeof dispatchVisitUpdateSchema>;

export const dispatchVisitDeleteSchema = z.object({
  id: z.string().min(1),
});
