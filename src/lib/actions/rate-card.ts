"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/auth/dev-session";
import { rateCardCreateSchema } from "@/lib/schemas/rate-card";
import type { ActionResult } from "./result";

export async function createRateCard(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  await requireAdmin();

  const parsed = rateCardCreateSchema.safeParse({
    clientAccountId: formData.get("clientAccountId"),
    techType: formData.get("techType"),
    rateUnit: formData.get("rateUnit"),
    rateAmount: formData.get("rateAmount"),
    otRate: formData.get("otRate") || undefined,
    effectiveFrom: formData.get("effectiveFrom"),
    effectiveTo: formData.get("effectiveTo") || undefined,
  });
  if (!parsed.success) {
    return { ok: false, fieldErrors: parsed.error.flatten().fieldErrors };
  }

  const card = await prisma.rateCard.create({
    data: {
      clientAccountId: parsed.data.clientAccountId,
      techType: parsed.data.techType,
      rateUnit: parsed.data.rateUnit,
      rateAmount: parsed.data.rateAmount,
      otRate: parsed.data.otRate ?? null,
      effectiveFrom: new Date(parsed.data.effectiveFrom),
      effectiveTo: parsed.data.effectiveTo ? new Date(parsed.data.effectiveTo) : null,
    },
  });

  revalidatePath(`/admin/accounts/${parsed.data.clientAccountId}`);
  return { ok: true, id: card.id };
}

export async function deleteRateCard(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  await requireAdmin();
  const id = String(formData.get("id") ?? "");
  if (!id) return { ok: false, formError: "Missing rate card id" };

  const card = await prisma.rateCard.delete({ where: { id } });
  revalidatePath(`/admin/accounts/${card.clientAccountId}`);
  return { ok: true };
}
