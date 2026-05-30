"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/auth/dev-session";
import {
  accountRateCreateSchema,
  accountRateUpdateAmountSchema,
} from "@/lib/schemas/account-rate";
import { annualToHourly } from "@/lib/invoice/billing-basis";
import type { ActionResult } from "./result";

// Rates are not time-versioned in the UI — every row is "always active". A fixed
// far-past effectiveFrom + null effectiveTo makes the resolver always pick it, and
// makes the (account, sub-category, band, SLA, effectiveFrom) unique key behave as
// one row per combo. Edit the amount in place to change a rate.
const ALWAYS_ACTIVE_FROM = new Date("2000-01-01T00:00:00.000Z");

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
    notes: formData.get("notes") || undefined,
  });
  if (!parsed.success) {
    return { ok: false, fieldErrors: parsed.error.flatten().fieldErrors };
  }

  // Annual Rate is a data-entry convenience for DEDICATED: store it as the
  // Hourly Rate (MONTHLY_DAY_RATE) at annual / 2080. No annual row persists.
  let rateSubCategoryId = parsed.data.rateSubCategoryId;
  let rateAmount = parsed.data.rateAmount;
  const sub = await prisma.rateSubCategory.findUnique({
    where: { id: rateSubCategoryId },
    select: { code: true, rateCategory: true },
  });
  if (sub?.rateCategory === "DEDICATED" && sub.code === "ANNUAL_RATE") {
    const hourly = await prisma.rateSubCategory.findUnique({
      where: { rateCategory_code: { rateCategory: "DEDICATED", code: "MONTHLY_DAY_RATE" } },
      select: { id: true },
    });
    if (hourly) {
      rateSubCategoryId = hourly.id;
      rateAmount = rateAmount != null ? annualToHourly(rateAmount) : undefined;
    }
  }

  try {
    const row = await prisma.accountRate.create({
      data: {
        clientAccountId: parsed.data.clientAccountId,
        rateSubCategoryId,
        band: parsed.data.band,
        slaId: parsed.data.slaId,
        rateAmount: rateAmount ?? null,
        effectiveFrom: ALWAYS_ACTIVE_FROM,
        effectiveTo: null,
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
          "A rate row for this sub-category / band / SLA already exists — edit its amount instead.",
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
