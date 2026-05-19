"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/auth/dev-session";
import { miscFeeCreateSchema } from "@/lib/schemas/misc-fee";
import type { ActionResult } from "./result";

export async function createMiscFee(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  await requireAdmin();

  const parsed = miscFeeCreateSchema.safeParse({
    clientAccountId: formData.get("clientAccountId"),
    kind: formData.get("kind"),
    label: formData.get("label"),
    amount: formData.get("amount") || undefined,
    notes: formData.get("notes") || undefined,
  });
  if (!parsed.success) {
    return { ok: false, fieldErrors: parsed.error.flatten().fieldErrors };
  }

  const fee = await prisma.miscFee.create({
    data: {
      clientAccountId: parsed.data.clientAccountId,
      kind: parsed.data.kind,
      label: parsed.data.label,
      amount: parsed.data.amount ?? null,
      notes: parsed.data.notes ?? null,
    },
  });
  revalidatePath(`/admin/accounts/${parsed.data.clientAccountId}`);
  return { ok: true, id: fee.id };
}

export async function deleteMiscFee(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  await requireAdmin();
  const id = String(formData.get("id") ?? "");
  if (!id) return { ok: false, formError: "Missing id" };

  const fee = await prisma.miscFee.delete({ where: { id } });
  revalidatePath(`/admin/accounts/${fee.clientAccountId}`);
  return { ok: true };
}
