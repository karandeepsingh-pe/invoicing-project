"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/auth/dev-session";
import {
  clientAccountCreateSchema,
  clientAccountUpdateSchema,
} from "@/lib/schemas/client-account";
import type { ActionResult } from "./result";

export async function createClientAccount(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  await requireAdmin();

  const parsed = clientAccountCreateSchema.safeParse({
    orgId: formData.get("orgId"),
    name: formData.get("name"),
    currency: formData.get("currency") || undefined,
  });
  if (!parsed.success) {
    return { ok: false, fieldErrors: parsed.error.flatten().fieldErrors };
  }

  try {
    const account = await prisma.clientAccount.create({ data: parsed.data });
    revalidatePath(`/admin/orgs/${parsed.data.orgId}`);
    revalidatePath(`/admin/accounts/${account.id}`);
    return { ok: true, id: account.id };
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return {
        ok: false,
        fieldErrors: { name: ["An account with this name already exists under this org"] },
      };
    }
    throw err;
  }
}

export async function updateClientAccount(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  await requireAdmin();

  const parsed = clientAccountUpdateSchema.safeParse({
    id: formData.get("id"),
    name: formData.get("name"),
    currency: formData.get("currency") || undefined,
  });
  if (!parsed.success) {
    return { ok: false, fieldErrors: parsed.error.flatten().fieldErrors };
  }

  const { id, ...data } = parsed.data;
  try {
    const account = await prisma.clientAccount.update({
      where: { id },
      data: { ...data, currency: data.currency ?? null },
      select: { orgId: true },
    });
    revalidatePath("/admin/accounts");
    revalidatePath("/admin/commercials");
    revalidatePath("/admin/management");
    revalidatePath(`/admin/orgs/${account.orgId}`);
    revalidatePath(`/admin/accounts/${id}`);
    return { ok: true, message: "Account updated." };
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return { ok: false, fieldErrors: { name: ["Another account under this org already has this name"] } };
    }
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2025") {
      return { ok: false, formError: "Account not found." };
    }
    throw err;
  }
}

export async function deleteClientAccount(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  await requireAdmin();

  const id = String(formData.get("id") ?? "");
  if (!id) return { ok: false, formError: "Missing account id." };

  const account = await prisma.clientAccount.findUnique({
    where: { id },
    include: {
      org: { select: { id: true, name: true } },
      _count: { select: { assignments: true, invoiceRuns: true } },
    },
  });
  if (!account) return { ok: false, formError: "Account not found." };

  if (account._count.assignments > 0 || account._count.invoiceRuns > 0) {
    const parts: string[] = [];
    if (account._count.assignments > 0) {
      parts.push(`${account._count.assignments} assignment(s)`);
    }
    if (account._count.invoiceRuns > 0) {
      parts.push(`${account._count.invoiceRuns} invoice run(s)`);
    }
    return {
      ok: false,
      formError: `Cannot delete "${account.name}" — it still has ${parts.join(" and ")}. End assignments and remove invoice runs first.`,
    };
  }

  try {
    // Rates, misc fees, and user-access rows cascade on delete; assignments
    // and invoice runs were already guarded above.
    await prisma.clientAccount.delete({ where: { id } });
    revalidatePath("/admin/management");
    revalidatePath("/admin/commercials");
    revalidatePath("/admin/accounts");
    revalidatePath(`/admin/orgs/${account.org.id}`);
    revalidatePath("/admin/orgs");
    return { ok: true, message: `Deleted "${account.name}".` };
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2003") {
      return {
        ok: false,
        formError:
          "Cannot delete this account because related records still reference it.",
      };
    }
    throw err;
  }
}
