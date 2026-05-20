"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/auth/dev-session";
import {
  rateSubCategoryCreateSchema,
  rateSubCategoryUpdateSchema,
} from "@/lib/schemas/rate-sub-category";
import type { ActionResult } from "./result";

function revalidateMasters() {
  revalidatePath("/admin/masters/sub-categories");
  revalidatePath("/admin/management");
  revalidatePath("/admin/commercials");
  revalidatePath("/admin/accounts");
  revalidatePath("/admin/technicians");
  revalidatePath("/admin", "layout");
}

export async function createRateSubCategory(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  await requireAdmin();
  const parsed = rateSubCategoryCreateSchema.safeParse({
    rateCategory: formData.get("rateCategory"),
    code: formData.get("code"),
    label: formData.get("label"),
    sortOrder: formData.get("sortOrder") || 0,
    isOvertimeVariant: formData.get("isOvertimeVariant") === "on",
  });
  if (!parsed.success) {
    return { ok: false, fieldErrors: parsed.error.flatten().fieldErrors };
  }
  try {
    const row = await prisma.rateSubCategory.create({ data: parsed.data });
    revalidateMasters();
    return { ok: true, id: row.id };
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return {
        ok: false,
        fieldErrors: { code: ["A sub-category with this code already exists for this category"] },
      };
    }
    throw err;
  }
}

export async function updateRateSubCategory(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  await requireAdmin();
  const parsed = rateSubCategoryUpdateSchema.safeParse({
    id: formData.get("id"),
    rateCategory: formData.get("rateCategory"),
    code: formData.get("code"),
    label: formData.get("label"),
    sortOrder: formData.get("sortOrder") || 0,
    isOvertimeVariant: formData.get("isOvertimeVariant") === "on",
  });
  if (!parsed.success) {
    return { ok: false, fieldErrors: parsed.error.flatten().fieldErrors };
  }
  const { id, ...data } = parsed.data;
  try {
    await prisma.rateSubCategory.update({ where: { id }, data });
    revalidateMasters();
    return { ok: true, message: "Sub-category updated." };
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return {
        ok: false,
        fieldErrors: { code: ["A sub-category with this code already exists for this category"] },
      };
    }
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2025") {
      return { ok: false, formError: "Sub-category not found." };
    }
    throw err;
  }
}

export async function deleteRateSubCategory(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  await requireAdmin();
  const id = String(formData.get("id") ?? "");
  if (!id) return { ok: false, formError: "Missing sub-category id." };

  const row = await prisma.rateSubCategory.findUnique({
    where: { id },
    include: { _count: { select: { accountRates: true } } },
  });
  if (!row) return { ok: false, formError: "Sub-category not found." };

  if (row._count.accountRates > 0) {
    return {
      ok: false,
      formError: `Cannot delete "${row.code}" — referenced by ${row._count.accountRates} rate row(s).`,
    };
  }

  try {
    await prisma.rateSubCategory.delete({ where: { id } });
    revalidateMasters();
    return { ok: true, message: `Deleted "${row.code}".` };
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2003") {
      return { ok: false, formError: "Cannot delete — related records reference this sub-category." };
    }
    throw err;
  }
}
