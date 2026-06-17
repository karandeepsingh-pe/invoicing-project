"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireAccountAccess, requireSession } from "@/lib/auth/session";
import {
  coverageCreateSchema,
  coverageDeleteSchema,
} from "@/lib/schemas/coverage";
import type { ActionResult } from "./result";

export async function createCoverageEvent(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const admin = await requireSession();

  const parsed = coverageCreateSchema.safeParse({
    coveredAssignmentId: formData.get("coveredAssignmentId"),
    coveringTechnicianId: formData.get("coveringTechnicianId"),
    date: formData.get("date"),
    hours: formData.get("hours"),
    expenseAmount: formData.get("expenseAmount") ?? undefined,
    expenseNotes: formData.get("expenseNotes") ?? undefined,
    notes: formData.get("notes") ?? undefined,
  });
  if (!parsed.success) {
    return { ok: false, fieldErrors: parsed.error.flatten().fieldErrors };
  }

  // Guard: the covered assignment must be a BACKFILL-tier technician — that is
  // what the Backfill day-rate buys.
  const covered = await prisma.assignment.findUnique({
    where: { id: parsed.data.coveredAssignmentId },
    select: {
      slaTier: true,
      clientAccountId: true,
      technicianId: true,
    },
  });
  if (!covered) {
    return { ok: false, formError: "Covered assignment not found." };
  }
  // SDM may only log coverage on accounts they own (admin: any).
  await requireAccountAccess(covered.clientAccountId);
  if (covered.slaTier !== "BACKFILL") {
    return {
      ok: false,
      formError: `Coverage only valid when covered tech's tier is BACKFILL (current: ${covered.slaTier}).`,
    };
  }

  // Covering tech: any ACTIVE pool technician (Project or Dispatch availability),
  // no assignment on this account required. Must differ from the covered tech.
  const covering = await prisma.technician.findUnique({
    where: { id: parsed.data.coveringTechnicianId },
    select: { id: true, active: true, isAvailableForProject: true, isAvailableForDispatch: true },
  });
  if (!covering || !covering.active) {
    return { ok: false, formError: "Covering technician not found or inactive." };
  }
  if (!covering.isAvailableForProject && !covering.isAvailableForDispatch) {
    return {
      ok: false,
      formError: "Covering technician must be in the Project or Dispatch pool.",
    };
  }
  if (covering.id === covered.technicianId) {
    return { ok: false, formError: "Covering technician must differ from the covered technician." };
  }

  const eventDate = new Date(`${parsed.data.date}T00:00:00.000Z`);
  const nextDay = new Date(eventDate.getTime() + 24 * 60 * 60 * 1000);

  // Same-date dual-work check (non-blocking): warn the SDM if the covering tech
  // already has work logged that day — coverage has no clock times, so dates
  // are the practical overlap unit.
  const [bookingCount, entryCount] = await Promise.all([
    prisma.technicianBooking.count({
      where: {
        technicianId: covering.id,
        deletedAt: null,
        startDateTime: { lt: nextDay },
        endDateTime: { gt: eventDate },
      },
    }),
    prisma.timesheetEntry.count({
      where: {
        deletedAt: null,
        date: eventDate,
        assignment: { technicianId: covering.id },
      },
    }),
  ]);
  const warning =
    bookingCount > 0 || entryCount > 0
      ? ` Note: this technician already has ${[
          bookingCount > 0 ? `${bookingCount} booking(s)` : null,
          entryCount > 0 ? `${entryCount} timesheet entr${entryCount === 1 ? "y" : "ies"}` : null,
        ]
          .filter(Boolean)
          .join(" and ")} on this date — check the hours don't overlap.`
      : "";

  try {
    const event = await prisma.coverageEvent.create({
      data: {
        coveredAssignmentId: parsed.data.coveredAssignmentId,
        coveringTechnicianId: parsed.data.coveringTechnicianId,
        date: eventDate,
        hours: new Prisma.Decimal(parsed.data.hours),
        expenseAmount:
          parsed.data.expenseAmount != null && parsed.data.expenseAmount > 0
            ? new Prisma.Decimal(parsed.data.expenseAmount)
            : null,
        expenseNotes: parsed.data.expenseNotes ?? null,
        notes: parsed.data.notes ?? null,
        enteredById: admin.userId,
      },
    });
    revalidatePath(`/admin/timesheets/${covered.clientAccountId}/coverage`);
    revalidatePath(`/admin/invoices/generate/${covered.clientAccountId}`);
    return { ok: true, id: event.id, message: `Coverage logged.${warning}` };
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return {
        ok: false,
        formError: "Covered tech already has a coverage event on this date.",
      };
    }
    if (err instanceof Prisma.PrismaClientKnownRequestError) {
      return { ok: false, formError: `Database error: ${err.code}` };
    }
    throw err;
  }
}

export async function deleteCoverageEvent(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  await requireSession();
  const parsed = coverageDeleteSchema.safeParse({ id: formData.get("id") });
  if (!parsed.success) {
    return { ok: false, formError: "Missing event id." };
  }
  // Resolve the owning account and gate before deleting.
  const existing = await prisma.coverageEvent.findUnique({
    where: { id: parsed.data.id },
    include: { coveredAssignment: { select: { clientAccountId: true } } },
  });
  if (!existing) return { ok: false, formError: "Coverage event not found." };
  await requireAccountAccess(existing.coveredAssignment.clientAccountId);

  await prisma.coverageEvent.delete({ where: { id: parsed.data.id } });
  revalidatePath(`/admin/timesheets/${existing.coveredAssignment.clientAccountId}/coverage`);
  return { ok: true, message: "Coverage event deleted." };
}
