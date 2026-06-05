"use server";

import { revalidatePath } from "next/cache";
import { AssignmentSlaTier, Prisma, RateCategory } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/auth/dev-session";
import { technicianCreateSchema, technicianUpdateSchema } from "@/lib/schemas/technician";
import { validateAssignment } from "@/lib/domain/assignment-validation";
import {
  resolvePostalCodeId,
  type LocationInput,
} from "./postal-code-resolve";
import type { ActionResult } from "./result";

// HTML checkboxes submit "on" when checked and nothing when unchecked.
function checkbox(v: FormDataEntryValue | null): boolean {
  return v === "on" || v === "true";
}

// Backfill is a Dedicated-only trait: a Dedicated tech must carry BACKFILL or
// NO_BACKFILL (their rate sheet splits by tier); any other category forces NONE.
function resolveTechSlaTier(
  primaryCategory: RateCategory,
  raw: AssignmentSlaTier | undefined,
): { ok: true; value: AssignmentSlaTier } | { ok: false; message: string } {
  if (primaryCategory !== RateCategory.DEDICATED) {
    return { ok: true, value: AssignmentSlaTier.NONE };
  }
  if (raw === AssignmentSlaTier.BACKFILL || raw === AssignmentSlaTier.NO_BACKFILL) {
    return { ok: true, value: raw };
  }
  return { ok: false, message: "Pick Backfill or No Backfill for a Dedicated technician" };
}

export async function createTechnician(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  await requireAdmin();

  const rawAccount = formData.get("initialAccountId");
  const parsed = technicianCreateSchema.safeParse({
    employerOrgId: formData.get("employerOrgId"),
    employeeId: formData.get("employeeId") ?? undefined,
    firstName: formData.get("firstName"),
    lastName: formData.get("lastName"),
    primaryCategory: formData.get("primaryCategory"),
    band: formData.get("band"),
    phone: formData.get("phone") ?? undefined,
    email: formData.get("email") ?? undefined,
    isRebadged: checkbox(formData.get("isRebadged")),
    annualSalary: formData.get("annualSalary") || undefined,
    rebadgedHourlyRate: formData.get("rebadgedHourlyRate") || undefined,
    rebadgedDayRate: formData.get("rebadgedDayRate") || undefined,
    rebadgedMonthlyRate: formData.get("rebadgedMonthlyRate") || undefined,
    rebadgedOtRate: formData.get("rebadgedOtRate") || undefined,
    rebadgedWeekendRate: formData.get("rebadgedWeekendRate") || undefined,
    isAvailableForDedicated: checkbox(formData.get("isAvailableForDedicated")),
    isAvailableForProject: checkbox(formData.get("isAvailableForProject")),
    isAvailableForDispatch: checkbox(formData.get("isAvailableForDispatch")),
    zipcode: formData.get("zipcode") ?? undefined,
    locationCity: formData.get("locationCity") ?? undefined,
    locationState: formData.get("locationState") ?? undefined,
    locationCountry: formData.get("locationCountry") ?? undefined,
    addressLine1: formData.get("addressLine1") ?? undefined,
    defaultSlaTier: formData.get("defaultSlaTier") || undefined,
    dedicatedBillingBasis: formData.get("dedicatedBillingBasis") || undefined,
    initialAccountId: rawAccount && rawAccount !== "" ? rawAccount : undefined,
    initialCategory: formData.get("initialCategory") || undefined,
    initialStartDate: formData.get("initialStartDate") || undefined,
    initialEndDate: formData.get("initialEndDate") || undefined,
  });
  if (!parsed.success) {
    return { ok: false, fieldErrors: parsed.error.flatten().fieldErrors };
  }

  const {
    initialAccountId,
    initialCategory,
    initialStartDate,
    initialEndDate,
    zipcode,
    locationCity,
    locationState,
    locationCountry,
    ...techData
  } = parsed.data;

  // Backfill trait: required for Dedicated techs (their rate splits by tier),
  // meaningless otherwise → force NONE. Applies whether or not we assign now.
  const tierResult = resolveTechSlaTier(techData.primaryCategory, techData.defaultSlaTier);
  if (!tierResult.ok) {
    return { ok: false, fieldErrors: { defaultSlaTier: [tierResult.message] } };
  }
  const techDataWithTier = { ...techData, defaultSlaTier: tierResult.value };

  const locationInput: LocationInput = {
    zipcode,
    locationCity,
    locationState,
    locationCountry,
  };

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
    // The assignment inherits the tech's backfill trait for a Dedicated engagement;
    // other categories don't use the tier. A Dedicated assignment with NONE resolves
    // to a 0 rate at invoice time, so block that contradictory combo.
    const slaTier =
      category === RateCategory.DEDICATED ? tierResult.value : AssignmentSlaTier.NONE;
    if (category === RateCategory.DEDICATED && slaTier === AssignmentSlaTier.NONE) {
      return {
        ok: false,
        formError:
          "To assign as Dedicated, set the technician's Primary category to Dedicated and pick a Backfill tier.",
      };
    }
    // Assigning a technician to a category implicitly makes them available for it,
    // so OR the matching flag on — otherwise the initial assignment would trip the
    // NOT_IN_POOL guard for a brand-new (all-flags-false) technician.
    const effectiveFlags = {
      isAvailableForDedicated:
        techData.isAvailableForDedicated || category === "DEDICATED",
      isAvailableForProject:
        techData.isAvailableForProject || category === "PROJECT_TM",
      isAvailableForDispatch:
        techData.isAvailableForDispatch || category === "DISPATCH_SCHED",
    };
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
      technicianFlags: effectiveFlags,
      technicianIsRebadged: techData.isRebadged,
      technicianAnnualSalary: Number(techData.annualSalary ?? 0),
      accountRates,
      existingTechnicianAssignments: [],
    });
    if (!validation.ok) {
      return { ok: false, formError: validation.message };
    }

    try {
      const result = await prisma.$transaction(async (tx) => {
        const loc = await resolvePostalCodeId(tx, locationInput);
        if (!loc.ok) return { kind: "validation" as const, fieldErrors: loc.fieldErrors };
        const created = await tx.technician.create({
          data: { ...techDataWithTier, ...effectiveFlags, postalCodeId: loc.postalCodeId },
        });
        await tx.assignment.create({
          data: {
            technicianId: created.id,
            clientAccountId: initialAccountId,
            rateCategory: category,
            slaTier,
            startDate: new Date(initialStartDate),
            endDate: initialEndDate ? new Date(initialEndDate) : null,
          },
        });
        return { kind: "created" as const, tech: created };
      });

      if (result.kind === "validation") {
        return { ok: false, fieldErrors: result.fieldErrors };
      }
      revalidatePath("/admin/technicians");
      revalidatePath("/admin/management");
      revalidatePath(`/admin/technicians/${result.tech.id}`);
      revalidatePath(`/admin/accounts/${initialAccountId}`);
      revalidatePath("/admin/masters/postal-codes");
      return { ok: true, id: result.tech.id };
    } catch (err) {
      const dup = duplicateEmployeeIdError(err);
      if (dup) return dup;
      throw err;
    }
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      const loc = await resolvePostalCodeId(tx, locationInput);
      if (!loc.ok) return { kind: "validation" as const, fieldErrors: loc.fieldErrors };
      const created = await tx.technician.create({
        data: { ...techDataWithTier, postalCodeId: loc.postalCodeId },
      });
      return { kind: "created" as const, tech: created };
    });
    if (result.kind === "validation") {
      return { ok: false, fieldErrors: result.fieldErrors };
    }
    revalidatePath("/admin/technicians");
    revalidatePath("/admin/management");
    revalidatePath("/admin/masters/postal-codes");
    return { ok: true, id: result.tech.id };
  } catch (err) {
    const dup = duplicateEmployeeIdError(err);
    if (dup) return dup;
    throw err;
  }
}

function duplicateEmployeeIdError(err: unknown): ActionResult | null {
  if (
    err instanceof Prisma.PrismaClientKnownRequestError &&
    err.code === "P2002" &&
    Array.isArray(err.meta?.target) &&
    (err.meta.target as string[]).includes("employeeId")
  ) {
    return {
      ok: false,
      fieldErrors: { employeeId: ["This Employee ID already exists for this org."] },
    };
  }
  return null;
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
    employeeId: formData.get("employeeId") ?? undefined,
    firstName: formData.get("firstName"),
    lastName: formData.get("lastName"),
    primaryCategory: formData.get("primaryCategory"),
    band: formData.get("band"),
    defaultSlaTier: formData.get("defaultSlaTier") || undefined,
    dedicatedBillingBasis: formData.get("dedicatedBillingBasis") || undefined,
    active: rawActive === "on" || rawActive === "true",
    phone: formData.get("phone") ?? undefined,
    email: formData.get("email") ?? undefined,
    isRebadged: checkbox(formData.get("isRebadged")),
    annualSalary: formData.get("annualSalary") || undefined,
    rebadgedHourlyRate: formData.get("rebadgedHourlyRate") || undefined,
    rebadgedDayRate: formData.get("rebadgedDayRate") || undefined,
    rebadgedMonthlyRate: formData.get("rebadgedMonthlyRate") || undefined,
    rebadgedOtRate: formData.get("rebadgedOtRate") || undefined,
    rebadgedWeekendRate: formData.get("rebadgedWeekendRate") || undefined,
    isAvailableForDedicated: checkbox(formData.get("isAvailableForDedicated")),
    isAvailableForProject: checkbox(formData.get("isAvailableForProject")),
    isAvailableForDispatch: checkbox(formData.get("isAvailableForDispatch")),
    zipcode: formData.get("zipcode") ?? undefined,
    locationCity: formData.get("locationCity") ?? undefined,
    locationState: formData.get("locationState") ?? undefined,
    locationCountry: formData.get("locationCountry") ?? undefined,
    addressLine1: formData.get("addressLine1") ?? undefined,
  });
  if (!parsed.success) {
    return { ok: false, fieldErrors: parsed.error.flatten().fieldErrors };
  }

  const {
    id,
    zipcode,
    locationCity,
    locationState,
    locationCountry,
    ...data
  } = parsed.data;

  const tierResult = resolveTechSlaTier(data.primaryCategory, data.defaultSlaTier);
  if (!tierResult.ok) {
    return { ok: false, fieldErrors: { defaultSlaTier: [tierResult.message] } };
  }

  const locationInput: LocationInput = {
    zipcode,
    locationCity,
    locationState,
    locationCountry,
  };

  try {
    const result = await prisma.$transaction(async (tx) => {
      const loc = await resolvePostalCodeId(tx, locationInput);
      if (!loc.ok) return { kind: "validation" as const, fieldErrors: loc.fieldErrors };
      await tx.technician.update({
        where: { id },
        data: { ...data, defaultSlaTier: tierResult.value, postalCodeId: loc.postalCodeId },
      });
      return { kind: "updated" as const };
    });
    if (result.kind === "validation") {
      return { ok: false, fieldErrors: result.fieldErrors };
    }
    revalidatePath("/admin/technicians");
    revalidatePath(`/admin/technicians/${id}`);
    revalidatePath("/admin/management");
    revalidatePath("/admin/masters/postal-codes");
    return { ok: true, message: "Technician updated." };
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2025") {
      return { ok: false, formError: "Technician not found." };
    }
    const dup = duplicateEmployeeIdError(err);
    if (dup) return dup;
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
    select: { id: true, firstName: true, lastName: true },
  });
  if (!tech) return { ok: false, formError: "Technician not found." };

  const assignments = await prisma.assignment.findMany({
    where: { technicianId: id },
    // Count only LIVE timesheet entries — soft-deleted rows don't block a purge.
    select: {
      id: true,
      endDate: true,
      _count: { select: { timesheetEntries: { where: { deletedAt: null } } } },
    },
  });
  const active = assignments.filter((a) => a.endDate === null);
  const withTimesheets = assignments.filter((a) => a._count.timesheetEntries > 0);

  if (active.length > 0) {
    return {
      ok: false,
      formError:
        `Cannot delete ${tech.firstName} ${tech.lastName} — ${active.length} assignment(s) still active. ` +
        `End them first.`,
    };
  }
  if (withTimesheets.length > 0) {
    const tsCount = withTimesheets.reduce((n, a) => n + a._count.timesheetEntries, 0);
    return {
      ok: false,
      formError:
        `Cannot delete ${tech.firstName} ${tech.lastName} — ${tsCount} live timesheet entr` +
        `${tsCount === 1 ? "y" : "ies"} exist across their assignments. Soft-delete those ` +
        `months from the timesheet grid first if you really want to purge this technician.`,
    };
  }

  try {
    await prisma.$transaction([
      prisma.assignment.deleteMany({ where: { technicianId: id } }),
      prisma.technician.delete({ where: { id } }),
    ]);
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
