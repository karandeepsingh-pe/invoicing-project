"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/auth/dev-session";
import { slaCreateSchema, slaUpdateSchema } from "@/lib/schemas/sla";
import type { ActionResult } from "./result";

function revalidateMasters() {
  revalidatePath("/admin/masters/slas");
  revalidatePath("/admin/management");
  revalidatePath("/admin/commercials");
  revalidatePath("/admin/accounts");
  revalidatePath("/admin/technicians");
  revalidatePath("/admin", "layout");
}

export async function createSla(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  await requireAdmin();
  const parsed = slaCreateSchema.safeParse({
    code: formData.get("code"),
    label: formData.get("label"),
    sortOrder: formData.get("sortOrder") || 0,
  });
  if (!parsed.success) {
    return { ok: false, fieldErrors: parsed.error.flatten().fieldErrors };
  }
  try {
    const sla = await prisma.sla.create({ data: parsed.data });
    revalidateMasters();
    return { ok: true, id: sla.id };
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return { ok: false, fieldErrors: { code: ["SLA code already exists"] } };
    }
    throw err;
  }
}

export async function updateSla(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  await requireAdmin();
  const parsed = slaUpdateSchema.safeParse({
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
    await prisma.sla.update({ where: { id }, data });
    revalidateMasters();
    return { ok: true, message: "SLA updated." };
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return { ok: false, fieldErrors: { code: ["SLA code already exists"] } };
    }
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2025") {
      return { ok: false, formError: "SLA not found." };
    }
    throw err;
  }
}

export async function deleteSla(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  await requireAdmin();
  const id = String(formData.get("id") ?? "");
  if (!id) return { ok: false, formError: "Missing SLA id." };

  const sla = await prisma.sla.findUnique({
    where: { id },
    include: { _count: { select: { accountRates: true } } },
  });
  if (!sla) return { ok: false, formError: "SLA not found." };

  if (sla._count.accountRates > 0) {
    return {
      ok: false,
      formError: `Cannot delete "${sla.code}" — it is referenced by ${sla._count.accountRates} rate row(s). Reassign or delete those rows first.`,
    };
  }

  try {
    await prisma.sla.delete({ where: { id } });
    revalidateMasters();
    return { ok: true, message: `Deleted "${sla.code}".` };
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2003") {
      return { ok: false, formError: "Cannot delete — related records still reference this SLA." };
    }
    throw err;
  }
}
