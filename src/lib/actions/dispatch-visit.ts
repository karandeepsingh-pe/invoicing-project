"use server";

import { revalidatePath } from "next/cache";
import { Prisma, AuditKind, BookingKind } from "@prisma/client";
import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import { requireAdmin } from "@/lib/auth/dev-session";
import {
  dispatchVisitCreateSchema,
  dispatchVisitUpdateSchema,
  dispatchVisitDeleteSchema,
} from "@/lib/schemas/dispatch-visit";
import { bookingEnvelope } from "@/lib/domain/booking-overlap";
import {
  executeDispatchVisitCreate,
  type DispatchConflict,
} from "@/lib/domain/dispatch-visit-create";
import { resolvePostalCodeId } from "./postal-code-resolve";
import type { ActionResult } from "./result";

export type { DispatchConflict };

export type DispatchVisitResult =
  | { ok: true; id?: string; message?: string }
  | {
      ok: false;
      formError?: string;
      fieldErrors?: Record<string, string[] | undefined>;
      needsOverride?: boolean;
      conflicts?: DispatchConflict[];
    }
  | null;

function isWeekendDate(iso: string): boolean {
  const d = new Date(`${iso}T00:00:00.000Z`).getUTCDay();
  return d === 0 || d === 6;
}

// Compose a UTC instant from a visit date + wall-clock "HH:mm" (same convention
// as every other time in the app: wall-clock-as-UTC, displayed with timeZone:UTC).
function composeUtc(dateIso: string, hhmm: string): Date {
  return new Date(`${dateIso}T${hhmm}:00.000Z`);
}

function decimalOrNull(n: number | undefined): Prisma.Decimal | null {
  return n === undefined ? null : new Prisma.Decimal(n);
}

function dateOrNull(iso: string | undefined): Date | null {
  return iso ? new Date(`${iso}T00:00:00.000Z`) : null;
}

export async function createDispatchVisit(
  _prev: DispatchVisitResult,
  formData: FormData,
): Promise<DispatchVisitResult> {
  const admin = await requireAdmin();

  const parsed = dispatchVisitCreateSchema.safeParse({
    assignmentId: formData.get("assignmentId"),
    visitDate: formData.get("visitDate"),
    requestReceivedDate: formData.get("requestReceivedDate") || undefined,
    proposedOnsiteDate: formData.get("proposedOnsiteDate") || undefined,
    visitTime: formData.get("visitTime") || undefined,
    siteCode: formData.get("siteCode") ?? undefined,
    ticketNumber: formData.get("ticketNumber") ?? undefined,
    hoursOnSite: formData.get("hoursOnSite"),
    oooHrs: formData.get("oooHrs") || undefined,
    afterHours: formData.get("afterHours") === "on" || formData.get("afterHours") === "true",
    weekend: formData.get("weekend") === "on" || formData.get("weekend") === "true",
    workStatus: formData.get("workStatus") || undefined,
    cancellationCharge: formData.get("cancellationCharge") || undefined,
    slaId: formData.get("slaId"),
    visitTypeId: formData.get("visitTypeId") || undefined,
    inTime: formData.get("inTime") || undefined,
    outTime: formData.get("outTime") || undefined,
    siteLocation: formData.get("siteLocation") ?? undefined,
    zipcode: formData.get("zipcode") ?? undefined,
    locationCity: formData.get("locationCity") ?? undefined,
    locationState: formData.get("locationState") ?? undefined,
    locationCountry: formData.get("locationCountry") ?? undefined,
    travelHours: formData.get("travelHours") || undefined,
    travelMiles: formData.get("travelMiles") || undefined,
    partsAmount: formData.get("partsAmount") || undefined,
    reimbursementNotes: formData.get("reimbursementNotes") ?? undefined,
    notes: formData.get("notes") ?? undefined,
    override: formData.get("override") === "on" || formData.get("override") === "true",
    overrideReason: formData.get("overrideReason") ?? undefined,
  });
  if (!parsed.success) {
    return { ok: false, fieldErrors: parsed.error.flatten().fieldErrors };
  }

  // Shared core (also used by the bulk xlsx upload) — same validation,
  // conflict, booking, and audit behavior for every visit.
  const outcome = await executeDispatchVisitCreate(parsed.data, admin.userId);
  switch (outcome.kind) {
    case "created":
      revalidatePath(`/admin/dispatch-visits/${outcome.clientAccountId}`);
      return { ok: true, id: outcome.id, message: "Visit added." };
    case "validation":
      return { ok: false, fieldErrors: outcome.fieldErrors };
    case "conflict":
      return {
        ok: false,
        needsOverride: true,
        conflicts: outcome.conflicts,
        formError: `Time-slot conflict with ${outcome.conflicts.length} existing booking(s) for this technician.`,
      };
    case "notFound":
      return { ok: false, formError: "Assignment not found." };
    case "dbError":
      return { ok: false, formError: `Database error: ${outcome.code}` };
  }
}

export async function updateDispatchVisit(
  _prev: DispatchVisitResult,
  formData: FormData,
): Promise<DispatchVisitResult> {
  const admin = await requireAdmin();

  const parsed = dispatchVisitUpdateSchema.safeParse({
    id: formData.get("id"),
    assignmentId: formData.get("assignmentId"),
    visitDate: formData.get("visitDate"),
    requestReceivedDate: formData.get("requestReceivedDate") || undefined,
    proposedOnsiteDate: formData.get("proposedOnsiteDate") || undefined,
    visitTime: formData.get("visitTime") || undefined,
    siteCode: formData.get("siteCode") ?? undefined,
    ticketNumber: formData.get("ticketNumber") ?? undefined,
    hoursOnSite: formData.get("hoursOnSite"),
    oooHrs: formData.get("oooHrs") || undefined,
    afterHours: formData.get("afterHours") === "on" || formData.get("afterHours") === "true",
    weekend: formData.get("weekend") === "on" || formData.get("weekend") === "true",
    workStatus: formData.get("workStatus") || undefined,
    cancellationCharge: formData.get("cancellationCharge") || undefined,
    slaId: formData.get("slaId"),
    visitTypeId: formData.get("visitTypeId") || undefined,
    inTime: formData.get("inTime") || undefined,
    outTime: formData.get("outTime") || undefined,
    siteLocation: formData.get("siteLocation") ?? undefined,
    zipcode: formData.get("zipcode") ?? undefined,
    locationCity: formData.get("locationCity") ?? undefined,
    locationState: formData.get("locationState") ?? undefined,
    locationCountry: formData.get("locationCountry") ?? undefined,
    travelHours: formData.get("travelHours") || undefined,
    travelMiles: formData.get("travelMiles") || undefined,
    partsAmount: formData.get("partsAmount") || undefined,
    reimbursementNotes: formData.get("reimbursementNotes") ?? undefined,
    notes: formData.get("notes") ?? undefined,
    override: formData.get("override") === "on" || formData.get("override") === "true",
    overrideReason: formData.get("overrideReason") ?? undefined,
  });
  if (!parsed.success) {
    return { ok: false, fieldErrors: parsed.error.flatten().fieldErrors };
  }
  const d = parsed.data;

  const existing = await prisma.dispatchVisit.findFirst({
    where: { id: d.id, deletedAt: null },
    select: { id: true },
  });
  if (!existing) return { ok: false, formError: "Visit not found." };

  const assignment = await prisma.assignment.findUnique({
    where: { id: d.assignmentId },
    select: { id: true, technicianId: true, clientAccountId: true },
  });
  if (!assignment) return { ok: false, formError: "Assignment not found." };

  const acct = await prisma.clientAccount.findUnique({
    where: { id: assignment.clientAccountId },
    select: { businessHoursStart: true, businessHoursEnd: true },
  });
  if (acct?.businessHoursStart && acct.businessHoursEnd && (!d.inTime || !d.outTime)) {
    return {
      ok: false,
      fieldErrors: {
        outTime: ["In-Time and Out-Time are required for this account (business-hours auto-split)."],
      },
    };
  }

  const isWeekend = d.weekend || isWeekendDate(d.visitDate);
  const start = d.inTime ? composeUtc(d.visitDate, d.inTime) : null;
  // Out ≤ In = the visit crossed midnight (overnight ticket): end on day+1.
  const crossesMidnight = Boolean(d.inTime && d.outTime && d.outTime <= d.inTime);
  let end = d.outTime ? composeUtc(d.visitDate, d.outTime) : null;
  if (end && crossesMidnight) end = new Date(end.getTime() + 24 * 60 * 60 * 1000);
  // Whole-hour booking envelope of In/Out (see createDispatchVisit).
  const slot = d.inTime && d.outTime ? bookingEnvelope(d.visitDate, d.inTime, d.outTime) : null;

  // Conflict check excludes THIS visit's own booking (so it never clashes with itself).
  let conflicts: DispatchConflict[] = [];
  if (slot) {
    const overlapping = await prisma.technicianBooking.findMany({
      where: {
        technicianId: assignment.technicianId,
        deletedAt: null,
        dispatchVisitId: { not: d.id },
        startDateTime: { lt: slot.end },
        endDateTime: { gt: slot.start },
      },
      select: { assignmentId: true, kind: true, startDateTime: true, endDateTime: true },
    });
    if (overlapping.length > 0) {
      const ids = Array.from(new Set(overlapping.map((o) => o.assignmentId)));
      const labels = await prisma.assignment.findMany({
        where: { id: { in: ids } },
        select: { id: true, clientAccount: { select: { name: true, org: { select: { name: true } } } } },
      });
      const labelById = new Map(
        labels.map((a) => [a.id, `${a.clientAccount.org.name} / ${a.clientAccount.name}`]),
      );
      conflicts = overlapping.map((o) => ({
        kind: o.kind,
        startDateTime: o.startDateTime.toISOString(),
        endDateTime: o.endDateTime.toISOString(),
        accountLabel: labelById.get(o.assignmentId) ?? "—",
      }));
    }
  }
  const hasConflict = conflicts.length > 0;
  if (hasConflict && !d.override) {
    return {
      ok: false,
      needsOverride: true,
      conflicts,
      formError: `Time-slot conflict with ${conflicts.length} existing booking(s) for this technician.`,
    };
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      const loc = await resolvePostalCodeId(tx, {
        zipcode: d.zipcode,
        locationCity: d.locationCity,
        locationState: d.locationState,
        locationCountry: d.locationCountry,
      });
      if (!loc.ok) return { kind: "validation" as const, fieldErrors: loc.fieldErrors };

      await tx.dispatchVisit.update({
        where: { id: d.id },
        data: {
          assignmentId: assignment.id,
          visitDate: new Date(`${d.visitDate}T00:00:00.000Z`),
          requestReceivedDate: dateOrNull(d.requestReceivedDate),
          proposedOnsiteDate: dateOrNull(d.proposedOnsiteDate),
          visitTime: d.visitTime ?? null,
          siteCode: d.siteCode ?? null,
          ticketNumber: d.ticketNumber ?? null,
          hoursOnSite: new Prisma.Decimal(d.hoursOnSite),
          oooHrs: decimalOrNull(d.oooHrs),
          afterHours: d.afterHours,
          weekend: isWeekend,
          workStatus: d.workStatus,
          cancellationCharge: decimalOrNull(d.cancellationCharge),
          slaId: d.slaId,
          visitTypeId: d.visitTypeId ?? null,
          startDateTime: start,
          endDateTime: end,
          siteLocation: d.siteLocation ?? null,
          postalCodeId: loc.postalCodeId,
          travelHours: decimalOrNull(d.travelHours),
          travelMiles: decimalOrNull(d.travelMiles),
          partsAmount: decimalOrNull(d.partsAmount),
          reimbursementNotes: d.reimbursementNotes ?? null,
          notes: d.notes ?? null,
        },
      });

      // Re-sync the linked booking: soft-delete any live one, then recreate if timed.
      await tx.technicianBooking.updateMany({
        where: { dispatchVisitId: d.id, deletedAt: null },
        data: { deletedAt: new Date(), deletedById: admin.userId },
      });
      if (slot) {
        await tx.technicianBooking.create({
          data: {
            technicianId: assignment.technicianId,
            assignmentId: assignment.id,
            kind: BookingKind.DISPATCH,
            startDateTime: slot.start,
            endDateTime: slot.end,
            dispatchVisitId: d.id,
            isOverride: hasConflict && d.override,
            overrideReason: hasConflict && d.override ? (d.overrideReason ?? null) : null,
            enteredById: admin.userId,
          },
        });
        if (hasConflict && d.override) {
          await tx.bookingAuditEvent.create({
            data: {
              kind: AuditKind.OVERLAP_OVERRIDE,
              actorId: admin.userId,
              technicianId: assignment.technicianId,
              assignmentId: assignment.id,
              detail: {
                dispatchVisitId: d.id,
                start: slot.start.toISOString(),
                end: slot.end.toISOString(),
                reason: d.overrideReason ?? null,
                conflicts: conflicts as unknown as Prisma.InputJsonValue,
              },
            },
          });
        }
      }
      return { kind: "updated" as const };
    });

    if (result.kind === "validation") {
      return { ok: false, fieldErrors: result.fieldErrors };
    }
    revalidatePath(`/admin/dispatch-visits/${assignment.clientAccountId}`);
    return { ok: true, id: d.id, message: "Visit updated." };
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError) {
      return { ok: false, formError: `Database error: ${err.code}` };
    }
    throw err;
  }
}

export async function deleteDispatchVisit(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const admin = await requireAdmin();
  // Soft-delete (testing-phase), gated. Cascade-soft-deletes the linked booking.
  if (!env.SOFT_DELETE_ENABLED) {
    return {
      ok: false,
      formError:
        "Soft-delete is disabled. Set SOFT_DELETE_ENABLED=true to enable it (testing only).",
    };
  }
  const parsed = dispatchVisitDeleteSchema.safeParse({ id: formData.get("id") });
  if (!parsed.success) {
    return { ok: false, formError: "Missing visit id." };
  }
  const now = new Date();
  const visit = await prisma.$transaction(async (tx) => {
    const v = await tx.dispatchVisit.update({
      where: { id: parsed.data.id },
      data: { deletedAt: now, deletedById: admin.userId },
      include: { assignment: { select: { clientAccountId: true } } },
    });
    await tx.technicianBooking.updateMany({
      where: { dispatchVisitId: parsed.data.id, deletedAt: null },
      data: { deletedAt: now, deletedById: admin.userId },
    });
    return v;
  });
  revalidatePath(`/admin/dispatch-visits/${visit.assignment.clientAccountId}`);
  return { ok: true, message: "Visit deleted." };
}
