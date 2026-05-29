"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/auth/dev-session";
import {
  postalCodeCreateSchema,
  postalCodeUpdateSchema,
} from "@/lib/schemas/postal-code";
import type { ActionResult } from "./result";

function revalidatePostalCodes() {
  revalidatePath("/admin/masters/postal-codes");
  revalidatePath("/admin/management");
  revalidatePath("/admin/technicians");
  revalidatePath("/admin", "layout");
}

export async function createPostalCode(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  await requireAdmin();
  const parsed = postalCodeCreateSchema.safeParse({
    zipcode: formData.get("zipcode"),
    city: formData.get("city"),
    state: formData.get("state"),
    country: formData.get("country"),
    sortOrder: formData.get("sortOrder") || 0,
  });
  if (!parsed.success) {
    return { ok: false, fieldErrors: parsed.error.flatten().fieldErrors };
  }
  try {
    const row = await prisma.postalCode.create({ data: parsed.data });
    revalidatePostalCodes();
    return { ok: true, id: row.id };
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return { ok: false, fieldErrors: { zipcode: ["Zipcode already exists"] } };
    }
    throw err;
  }
}

export async function updatePostalCode(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  await requireAdmin();
  const parsed = postalCodeUpdateSchema.safeParse({
    id: formData.get("id"),
    zipcode: formData.get("zipcode"),
    city: formData.get("city"),
    state: formData.get("state"),
    country: formData.get("country"),
    sortOrder: formData.get("sortOrder") || 0,
  });
  if (!parsed.success) {
    return { ok: false, fieldErrors: parsed.error.flatten().fieldErrors };
  }
  const { id, ...data } = parsed.data;
  try {
    await prisma.postalCode.update({ where: { id }, data });
    revalidatePostalCodes();
    return { ok: true, message: "Postal code updated." };
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return { ok: false, fieldErrors: { zipcode: ["Zipcode already exists"] } };
    }
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2025") {
      return { ok: false, formError: "Postal code not found." };
    }
    throw err;
  }
}

export async function deletePostalCode(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  await requireAdmin();
  const id = String(formData.get("id") ?? "");
  if (!id) return { ok: false, formError: "Missing postal code id." };

  const row = await prisma.postalCode.findUnique({
    where: { id },
    include: { _count: { select: { technicians: true } } },
  });
  if (!row) return { ok: false, formError: "Postal code not found." };

  if (row._count.technicians > 0) {
    return {
      ok: false,
      formError: `Cannot delete "${row.zipcode}" — ${row._count.technicians} technician(s) still reference it. Reassign them first.`,
    };
  }

  try {
    await prisma.postalCode.delete({ where: { id } });
    revalidatePostalCodes();
    return { ok: true, message: `Deleted "${row.zipcode}".` };
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2003") {
      return {
        ok: false,
        formError: "Cannot delete — related records still reference this postal code.",
      };
    }
    throw err;
  }
}
