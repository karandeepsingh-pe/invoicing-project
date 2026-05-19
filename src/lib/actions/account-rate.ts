"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/auth/dev-session";
import {
  accountRateCreateSchema,
  accountRateUpdateAmountSchema,
} from "@/lib/schemas/account-rate";
import type { ActionResult } from "./result";

export async function createAccountRate(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  await requireAdmin();

  const parsed = accountRateCreateSchema.safeParse({
    clientAccountId: formData.get("clientAccountId"),
    rateSubCategoryId: formData.get("rateSubCategoryId"),
    band: formData.get("band"),
    slaId: formData.get("slaId"),
    rateAmount: formData.get("rateAmount") || undefined,
    effectiveFrom: formData.get("effectiveFrom"),
    effectiveTo: formData.get("effectiveTo") || undefined,
    notes: formData.get("notes") || undefined,
  });
  if (!parsed.success) {
    return { ok: false, fieldErrors: parsed.error.flatten().fieldErrors };
  }

  try {
    const row = await prisma.accountRate.create({
      data: {
        clientAccountId: parsed.data.clientAccountId,
        rateSubCategoryId: parsed.data.rateSubCategoryId,
        band: parsed.data.band,
        slaId: parsed.data.slaId,
        rateAmount: parsed.data.rateAmount ?? null,
        effectiveFrom: new Date(parsed.data.effectiveFrom),
        effectiveTo: parsed.data.effectiveTo ? new Date(parsed.data.effectiveTo) : null,
        notes: parsed.data.notes ?? null,
      },
    });
    revalidatePath(`/admin/accounts/${parsed.data.clientAccountId}`);
    return { ok: true, id: row.id };
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return {
        ok: false,
        formError:
          "A rate row with the same sub-category / band / SLA / effective-from already exists.",
      };
    }
    throw err;
  }
}

export async function updateAccountRateAmount(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  await requireAdmin();

  const parsed = accountRateUpdateAmountSchema.safeParse({
    id: formData.get("id"),
    rateAmount: formData.get("rateAmount") || undefined,
  });
  if (!parsed.success) {
    return { ok: false, fieldErrors: parsed.error.flatten().fieldErrors };
  }

  const row = await prisma.accountRate.update({
    where: { id: parsed.data.id },
    data: { rateAmount: parsed.data.rateAmount ?? null },
  });
  revalidatePath(`/admin/accounts/${row.clientAccountId}`);
  return { ok: true };
}

export async function deleteAccountRate(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  await requireAdmin();
  const id = String(formData.get("id") ?? "");
  if (!id) return { ok: false, formError: "Missing id" };

  const row = await prisma.accountRate.delete({ where: { id } });
  revalidatePath(`/admin/accounts/${row.clientAccountId}`);
  return { ok: true };
}
