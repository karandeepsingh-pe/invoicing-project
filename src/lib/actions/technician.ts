"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/auth/dev-session";
import { technicianCreateSchema, technicianUpdateSchema } from "@/lib/schemas/technician";
import { validateAssignment } from "@/lib/domain/assignment-validation";
import type { ActionResult } from "./result";

export async function createTechnician(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  await requireAdmin();

  const rawAccount = formData.get("initialAccountId");
  const parsed = technicianCreateSchema.safeParse({
    employerOrgId: formData.get("employerOrgId"),
    firstName: formData.get("firstName"),
    lastName: formData.get("lastName"),
    primaryCategory: formData.get("primaryCategory"),
    band: formData.get("band"),
    initialAccountId: rawAccount && rawAccount !== "" ? rawAccount : undefined,
    initialCategory: formData.get("initialCategory") || undefined,
    initialStartDate: formData.get("initialStartDate") || undefined,
  });
  if (!parsed.success) {
    return { ok: false, fieldErrors: parsed.error.flatten().fieldErrors };
  }

  const {
    initialAccountId,
    initialCategory,
    initialStartDate,
    ...techData
  } = parsed.data;

  // If an initial assignment was requested, validate before creating tech so we
  // don't end up with an orphan tech when the assignment cannot stand.
  if (initialAccountId) {
    if (!initialStartDate) {
      return {
        ok: false,
        fieldErrors: { initialStartDate: ["Start date is required when assigning an account"] },
      };
    }
    const category = initialCategory ?? techData.primaryCategory;
    const accountRates = await prisma.accountRate.findMany({
      where: { clientAccountId: initialAccountId },
      select: {
        band: true,
        effectiveFrom: true,
        effectiveTo: true,
        rateSubCategory: { select: { rateCategory: true } },
      },
    });
    const validation = validateAssignment({
      technicianId: "pending",
      technicianBand: techData.band,
      rateCategory: category,
      startDate: new Date(initialStartDate),
      endDate: null,
      accountRates,
      existingTechnicianAssignments: [],
    });
    if (!validation.ok) {
      return { ok: false, formError: validation.message };
    }

    const tech = await prisma.$transaction(async (tx) => {
      const created = await tx.technician.create({ data: techData });
      await tx.assignment.create({
        data: {
          technicianId: created.id,
          clientAccountId: initialAccountId,
          rateCategory: category,
          startDate: new Date(initialStartDate),
        },
      });
      return created;
    });

    revalidatePath("/admin/technicians");
    revalidatePath("/admin/management");
    revalidatePath(`/admin/technicians/${tech.id}`);
    revalidatePath(`/admin/accounts/${initialAccountId}`);
    return { ok: true, id: tech.id };
  }

  const tech = await prisma.technician.create({ data: techData });
  revalidatePath("/admin/technicians");
  revalidatePath("/admin/management");
  return { ok: true, id: tech.id };
}

export async function updateTechnician(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  await requireAdmin();

  const rawActive = formData.get("active");
  const parsed = technicianUpdateSchema.safeParse({
    id: formData.get("id"),
    employerOrgId: formData.get("employerOrgId"),
    firstName: formData.get("firstName"),
    lastName: formData.get("lastName"),
    primaryCategory: formData.get("primaryCategory"),
    band: formData.get("band"),
    active: rawActive === "on" || rawActive === "true",
  });
  if (!parsed.success) {
    return { ok: false, fieldErrors: parsed.error.flatten().fieldErrors };
  }

  const { id, ...data } = parsed.data;

  try {
    await prisma.technician.update({ where: { id }, data });
    revalidatePath("/admin/technicians");
    revalidatePath(`/admin/technicians/${id}`);
    revalidatePath("/admin/management");
    return { ok: true, message: "Technician updated." };
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2025") {
      return { ok: false, formError: "Technician not found." };
    }
    throw err;
  }
}

export async function deleteTechnician(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  await requireAdmin();

  const id = String(formData.get("id") ?? "");
  if (!id) return { ok: false, formError: "Missing technician id." };

  const tech = await prisma.technician.findUnique({
    where: { id },
    include: { _count: { select: { assignments: true } } },
  });
  if (!tech) return { ok: false, formError: "Technician not found." };

  if (tech._count.assignments > 0) {
    return {
      ok: false,
      formError:
        `Cannot delete ${tech.firstName} ${tech.lastName} — they still have ${tech._count.assignments} assignment(s). ` +
        `End all assignments first.`,
    };
  }

  try {
    await prisma.technician.delete({ where: { id } });
    revalidatePath("/admin/technicians");
    revalidatePath("/admin/management");
    return { ok: true, message: `Deleted ${tech.firstName} ${tech.lastName}.` };
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2003") {
      return {
        ok: false,
        formError:
          "Cannot delete this technician because related records still reference them.",
      };
    }
    throw err;
  }
}
