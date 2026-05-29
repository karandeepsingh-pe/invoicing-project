"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/auth/dev-session";
import {
  coverageCreateSchema,
  coverageDeleteSchema,
} from "@/lib/schemas/coverage";
import { resolvePolicy } from "@/lib/domain/policy-resolver";
import type { ActionResult } from "./result";

export async function createCoverageEvent(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const admin = await requireAdmin();

  const parsed = coverageCreateSchema.safeParse({
    coveredAssignmentId: formData.get("coveredAssignmentId"),
    coveringAssignmentId: formData.get("coveringAssignmentId"),
    date: formData.get("date"),
    hours: formData.get("hours"),
    notes: formData.get("notes") ?? undefined,
  });
  if (!parsed.success) {
    return { ok: false, fieldErrors: parsed.error.flatten().fieldErrors };
  }

  // Guards: org policy must allow backfill, and the covered assignment must be
  // BACKFILL tier. Both enforced app-side.
  const covered = await prisma.assignment.findUnique({
    where: { id: parsed.data.coveredAssignmentId },
    select: {
      slaTier: true,
      clientAccountId: true,
      clientAccount: {
        select: {
          backfillAllowedOverride: true,
          rateBasisOverride: true,
          org: { select: { backfillAllowed: true, rateBasis: true } },
        },
      },
    },
  });
  if (!covered) {
    return { ok: false, formError: "Covered assignment not found." };
  }
  const policy = resolvePolicy(covered.clientAccount.org, {
    backfillAllowedOverride: covered.clientAccount.backfillAllowedOverride,
    rateBasisOverride: covered.clientAccount.rateBasisOverride,
  });
  if (!policy.backfillAllowed) {
    return {
      ok: false,
      formError:
        "This account's organization policy does not allow backfill, so coverage events cannot be recorded.",
    };
  }
  if (covered.slaTier !== "BACKFILL") {
    return {
      ok: false,
      formError: `Coverage only valid when covered tech's tier is BACKFILL (current: ${covered.slaTier}).`,
    };
  }

  try {
    const event = await prisma.coverageEvent.create({
      data: {
        coveredAssignmentId: parsed.data.coveredAssignmentId,
        coveringAssignmentId: parsed.data.coveringAssignmentId,
        date: new Date(`${parsed.data.date}T00:00:00.000Z`),
        hours: new Prisma.Decimal(parsed.data.hours),
        notes: parsed.data.notes ?? null,
        enteredById: admin.userId,
      },
    });
    revalidatePath(`/admin/timesheets/${covered.clientAccountId}/coverage`);
    revalidatePath(`/admin/invoices/generate/${covered.clientAccountId}`);
    return { ok: true, id: event.id };
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
  await requireAdmin();
  const parsed = coverageDeleteSchema.safeParse({ id: formData.get("id") });
  if (!parsed.success) {
    return { ok: false, formError: "Missing event id." };
  }
  const event = await prisma.coverageEvent.delete({
    where: { id: parsed.data.id },
    include: { coveredAssignment: { select: { clientAccountId: true } } },
  });
  revalidatePath(`/admin/timesheets/${event.coveredAssignment.clientAccountId}/coverage`);
  return { ok: true, message: "Coverage event deleted." };
}
