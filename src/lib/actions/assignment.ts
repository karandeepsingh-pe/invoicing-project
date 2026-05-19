"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/auth/dev-session";
import { assignmentCreateSchema } from "@/lib/schemas/assignment";
import { validateAssignment } from "@/lib/domain/assignment-validation";
import type { ActionResult } from "./result";

export async function createAssignment(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  await requireAdmin();

  const parsed = assignmentCreateSchema.safeParse({
    technicianId: formData.get("technicianId"),
    clientAccountId: formData.get("clientAccountId"),
    rateCategory: formData.get("rateCategory"),
    startDate: formData.get("startDate"),
    endDate: formData.get("endDate") || undefined,
  });
  if (!parsed.success) {
    return { ok: false, fieldErrors: parsed.error.flatten().fieldErrors };
  }

  const startDate = new Date(parsed.data.startDate);
  const endDate = parsed.data.endDate ? new Date(parsed.data.endDate) : null;

  const tech = await prisma.technician.findUnique({
    where: { id: parsed.data.technicianId },
    select: { id: true, band: true },
  });
  if (!tech) return { ok: false, formError: "Technician not found" };

  const [accountRates, existingTechAssignments] = await Promise.all([
    prisma.accountRate.findMany({
      where: { clientAccountId: parsed.data.clientAccountId },
      select: {
        band: true,
        effectiveFrom: true,
        effectiveTo: true,
        rateSubCategory: { select: { rateCategory: true } },
      },
    }),
    prisma.assignment.findMany({
      where: { technicianId: parsed.data.technicianId },
      select: { id: true, rateCategory: true, endDate: true },
    }),
  ]);

  const validation = validateAssignment({
    technicianId: tech.id,
    technicianBand: tech.band,
    rateCategory: parsed.data.rateCategory,
    startDate,
    endDate,
    accountRates,
    existingTechnicianAssignments: existingTechAssignments,
  });
  if (!validation.ok) {
    return { ok: false, formError: validation.message };
  }

  try {
    const assignment = await prisma.assignment.create({
      data: {
        technicianId: parsed.data.technicianId,
        clientAccountId: parsed.data.clientAccountId,
        rateCategory: parsed.data.rateCategory,
        startDate,
        endDate,
      },
    });
    revalidatePath(`/admin/technicians/${parsed.data.technicianId}`);
    revalidatePath(`/admin/accounts/${parsed.data.clientAccountId}`);
    return { ok: true, id: assignment.id };
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return {
        ok: false,
        formError: "Technician already has an active DEDICATED assignment (DB constraint).",
      };
    }
    throw err;
  }
}

export async function endAssignment(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  await requireAdmin();
  const id = String(formData.get("id") ?? "");
  const endDateStr = String(formData.get("endDate") ?? "");
  if (!id || !/^\d{4}-\d{2}-\d{2}$/.test(endDateStr)) {
    return { ok: false, formError: "Missing id or invalid end date (YYYY-MM-DD)" };
  }
  const a = await prisma.assignment.update({
    where: { id },
    data: { endDate: new Date(endDateStr) },
  });
  revalidatePath(`/admin/technicians/${a.technicianId}`);
  revalidatePath(`/admin/accounts/${a.clientAccountId}`);
  return { ok: true };
}
