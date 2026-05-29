"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/auth/dev-session";
import { visitTypeCreateSchema, visitTypeUpdateSchema } from "@/lib/schemas/visit-type";
import type { ActionResult } from "./result";

function revalidateMasters() {
  revalidatePath("/admin/masters/visit-types");
  revalidatePath("/admin", "layout");
}

export async function createVisitType(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  await requireAdmin();
  const parsed = visitTypeCreateSchema.safeParse({
    code: formData.get("code"),
    label: formData.get("label"),
    sortOrder: formData.get("sortOrder") || 0,
  });
  if (!parsed.success) {
    return { ok: false, fieldErrors: parsed.error.flatten().fieldErrors };
  }
  try {
    const t = await prisma.dispatchVisitType.create({ data: parsed.data });
    revalidateMasters();
    return { ok: true, id: t.id };
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return { ok: false, fieldErrors: { code: ["Visit type code already exists"] } };
    }
    throw err;
  }
}

export async function updateVisitType(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  await requireAdmin();
  const parsed = visitTypeUpdateSchema.safeParse({
    id: formData.get("id"),
    code: formData.get("code"),
    label: formData.get("label"),
    sortOrder: formData.get("sortOrder") || 0,
  });
  if (!parsed.success) {
    return { ok: false, fieldErrors: parsed.error.flatten().fieldErrors };
  }
  const { id, ...data } = parsed.data;
  try {
    await prisma.dispatchVisitType.update({ where: { id }, data });
    revalidateMasters();
    return { ok: true, message: "Visit type updated." };
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return { ok: false, fieldErrors: { code: ["Visit type code already exists"] } };
    }
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2025") {
      return { ok: false, formError: "Visit type not found." };
    }
    throw err;
  }
}

export async function deleteVisitType(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  await requireAdmin();
  const id = String(formData.get("id") ?? "");
  if (!id) return { ok: false, formError: "Missing visit type id." };

  const t = await prisma.dispatchVisitType.findUnique({
    where: { id },
    include: { _count: { select: { visits: true } } },
  });
  if (!t) return { ok: false, formError: "Visit type not found." };

  if (t._count.visits > 0) {
    return {
      ok: false,
      formError: `Cannot delete "${t.code}" — it is referenced by ${t._count.visits} visit(s). Reassign or delete those visits first.`,
    };
  }

  try {
    await prisma.dispatchVisitType.delete({ where: { id } });
    revalidateMasters();
    return { ok: true, message: `Deleted "${t.code}".` };
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2003") {
      return { ok: false, formError: "Cannot delete — related records still reference this visit type." };
    }
    throw err;
  }
}
