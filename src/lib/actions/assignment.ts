"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/auth/dev-session";
import { assignmentCreateSchema, assignmentBulkCreateSchema } from "@/lib/schemas/assignment";
import {
  validateAssignment,
  deriveAssignmentSlaTier,
} from "@/lib/domain/assignment-validation";
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
    select: {
      id: true,
      band: true,
      isRebadged: true,
      annualSalary: true,
      defaultSlaTier: true,
      isAvailableForDedicated: true,
      isAvailableForProject: true,
      isAvailableForDispatch: true,
    },
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

  const slaTier = deriveAssignmentSlaTier(parsed.data.rateCategory, tech.defaultSlaTier);

  const validation = validateAssignment({
    technicianId: tech.id,
    technicianBand: tech.band,
    rateCategory: parsed.data.rateCategory,
    startDate,
    endDate,
    technicianFlags: {
      isAvailableForDedicated: tech.isAvailableForDedicated,
      isAvailableForProject: tech.isAvailableForProject,
      isAvailableForDispatch: tech.isAvailableForDispatch,
    },
    technicianIsRebadged: tech.isRebadged,
    technicianAnnualSalary: Number(tech.annualSalary ?? 0),
    accountRates,
    existingTechnicianAssignments: existingTechAssignments,
    slaTier,
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
        slaTier,
        startDate,
        endDate,
      },
    });
    revalidatePath(`/admin/technicians/${parsed.data.technicianId}`);
    revalidatePath(`/admin/accounts/${parsed.data.clientAccountId}`);
    revalidatePath("/admin/management");
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

export async function createAssignments(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  await requireAdmin();

  const parsed = assignmentBulkCreateSchema.safeParse({
    technicianIds: formData.getAll("technicianIds"),
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
  const ids = Array.from(new Set(parsed.data.technicianIds));

  const [techs, accountRates, existing] = await Promise.all([
    prisma.technician.findMany({
      where: { id: { in: ids } },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        band: true,
        isRebadged: true,
        annualSalary: true,
        defaultSlaTier: true,
        isAvailableForDedicated: true,
        isAvailableForProject: true,
        isAvailableForDispatch: true,
      },
    }),
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
      where: { technicianId: { in: ids } },
      select: { id: true, technicianId: true, rateCategory: true, endDate: true },
    }),
  ]);

  if (techs.length !== ids.length) {
    return { ok: false, formError: "One or more selected technicians no longer exist." };
  }

  // Validate every selected technician up front; all-or-nothing. Each assignment's
  // tier is derived from that technician's backfill trait.
  const failures: string[] = [];
  for (const tech of techs) {
    const v = validateAssignment({
      technicianId: tech.id,
      technicianBand: tech.band,
      rateCategory: parsed.data.rateCategory,
      startDate,
      endDate,
      technicianFlags: {
        isAvailableForDedicated: tech.isAvailableForDedicated,
        isAvailableForProject: tech.isAvailableForProject,
        isAvailableForDispatch: tech.isAvailableForDispatch,
      },
      technicianIsRebadged: tech.isRebadged,
      technicianAnnualSalary: Number(tech.annualSalary ?? 0),
      accountRates,
      existingTechnicianAssignments: existing.filter((a) => a.technicianId === tech.id),
      slaTier: deriveAssignmentSlaTier(parsed.data.rateCategory, tech.defaultSlaTier),
    });
    if (!v.ok) failures.push(`${tech.firstName} ${tech.lastName}: ${v.message}`);
  }

  if (failures.length > 0) {
    return {
      ok: false,
      formError: `Cannot assign. Fix the selection and resubmit:\n${failures.join("\n")}`,
    };
  }

  try {
    await prisma.assignment.createMany({
      data: techs.map((tech) => ({
        technicianId: tech.id,
        clientAccountId: parsed.data.clientAccountId,
        rateCategory: parsed.data.rateCategory,
        slaTier: deriveAssignmentSlaTier(parsed.data.rateCategory, tech.defaultSlaTier),
        startDate,
        endDate,
      })),
    });
    revalidatePath(`/admin/accounts/${parsed.data.clientAccountId}`);
    revalidatePath("/admin/management");
    for (const id of ids) revalidatePath(`/admin/technicians/${id}`);
    return {
      ok: true,
      message: `Assigned ${ids.length} technician${ids.length === 1 ? "" : "s"}.`,
    };
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return {
        ok: false,
        formError: "One of the technicians already has an active DEDICATED assignment.",
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
  revalidatePath("/admin/management");
  return { ok: true };
}

export async function deleteAssignment(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  await requireAdmin();
  const id = String(formData.get("id") ?? "");
  if (!id) return { ok: false, formError: "Missing assignment id." };

  const a = await prisma.assignment.findUnique({
    where: { id },
    // Only LIVE (non-soft-deleted) entries block a hard delete — soft-deleted
    // rows are cascade-purged when the assignment is removed.
    include: { _count: { select: { timesheetEntries: { where: { deletedAt: null } } } } },
  });
  if (!a) return { ok: false, formError: "Assignment not found." };

  if (a._count.timesheetEntries > 0) {
    return {
      ok: false,
      formError:
        `Cannot delete — this assignment has ${a._count.timesheetEntries} live timesheet ` +
        `entr${a._count.timesheetEntries === 1 ? "y" : "ies"}. ` +
        `Soft-delete the month from the timesheet grid first, or end the assignment instead.`,
    };
  }

  await prisma.assignment.delete({ where: { id } });
  revalidatePath(`/admin/technicians/${a.technicianId}`);
  revalidatePath(`/admin/accounts/${a.clientAccountId}`);
  revalidatePath("/admin/management");
  return { ok: true, message: "Assignment deleted." };
}

export async function deleteAssignments(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  await requireAdmin();

  const ids = Array.from(
    new Set(
      formData
        .getAll("ids")
        .map((v) => String(v))
        .filter((v) => v.length > 0),
    ),
  );
  if (ids.length === 0) return { ok: false, formError: "Select at least one assignment." };

  const found = await prisma.assignment.findMany({
    where: { id: { in: ids } },
    select: {
      id: true,
      technicianId: true,
      clientAccountId: true,
      technician: { select: { firstName: true, lastName: true } },
      // Only LIVE (non-soft-deleted) entries block a hard delete, exactly like the
      // single deleteAssignment guard above.
      _count: { select: { timesheetEntries: { where: { deletedAt: null } } } },
    },
  });
  if (found.length === 0) return { ok: false, formError: "Assignment(s) not found." };

  // All-or-nothing: if any selection still has live timesheet entries, delete none
  // and name each blocker so the admin can clear those months first.
  const blocked = found.filter((a) => a._count.timesheetEntries > 0);
  if (blocked.length > 0) {
    const lines = blocked.map((a) => {
      const n = a._count.timesheetEntries;
      return `${a.technician.firstName} ${a.technician.lastName} (${n} live entr${n === 1 ? "y" : "ies"})`;
    });
    return {
      ok: false,
      formError:
        "Cannot delete yet. Clear these timesheets first (soft-delete the month from the " +
        `timesheet grid), then retry:\n${lines.join("\n")}`,
    };
  }

  const foundIds = found.map((a) => a.id);
  await prisma.assignment.deleteMany({ where: { id: { in: foundIds } } });

  const accountIds = Array.from(new Set(found.map((a) => a.clientAccountId)));
  const techIds = Array.from(new Set(found.map((a) => a.technicianId)));
  for (const accountId of accountIds) revalidatePath(`/admin/accounts/${accountId}`);
  for (const techId of techIds) revalidatePath(`/admin/technicians/${techId}`);
  revalidatePath("/admin/management");

  return {
    ok: true,
    message: `Deleted ${foundIds.length} assignment${foundIds.length === 1 ? "" : "s"}.`,
  };
}
