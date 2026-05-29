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
    clientPocName: formData.get("clientPocName") ?? undefined,
    clientSpocEmail: formData.get("clientSpocEmail") ?? undefined,
    projectDescription: formData.get("projectDescription") ?? undefined,
    defaultHours: formData.get("defaultHours") || undefined,
  });
  if (!parsed.success) {
    return { ok: false, fieldErrors: parsed.error.flatten().fieldErrors };
  }

  try {
    const account = await prisma.clientAccount.create({ data: parsed.data });
    revalidatePath(`/admin/orgs/${parsed.data.orgId}`);
    revalidatePath(`/admin/accounts/${account.id}`);
    revalidatePath("/admin/accounts");
    revalidatePath("/admin/management");
    revalidatePath("/admin/commercials");
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
    clientPocName: formData.get("clientPocName") ?? undefined,
    clientSpocEmail: formData.get("clientSpocEmail") ?? undefined,
    projectDescription: formData.get("projectDescription") ?? undefined,
    defaultHours: formData.get("defaultHours") || undefined,
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
    include: { org: { select: { id: true, name: true } } },
  });
  if (!account) return { ok: false, formError: "Account not found." };

  const assignments = await prisma.assignment.findMany({
    where: { clientAccountId: id },
    // Live entries only — soft-deleted rows are cascade-purged with the assignment.
    select: {
      id: true,
      endDate: true,
      _count: { select: { timesheetEntries: { where: { deletedAt: null } } } },
    },
  });
  const active = assignments.filter((a) => a.endDate === null);
  const withTimesheets = assignments.filter((a) => a._count.timesheetEntries > 0);

  // Invoice runs are audit metadata (no stored file) — they do NOT block deletion;
  // they're cleared in the transaction below. Only real data blocks: active
  // assignments and live timesheet entries.
  const blockers: string[] = [];
  if (active.length > 0) blockers.push(`${active.length} active assignment(s)`);
  if (withTimesheets.length > 0) {
    const tsCount = withTimesheets.reduce((n, a) => n + a._count.timesheetEntries, 0);
    blockers.push(`${tsCount} timesheet entr${tsCount === 1 ? "y" : "ies"}`);
  }
  if (blockers.length > 0) {
    return {
      ok: false,
      formError:
        `Cannot delete "${account.name}" — it still has ${blockers.join(", ")}. ` +
        `End active assignments and remove timesheets first.`,
    };
  }

  try {
    // Rates, misc fees, and user-access rows cascade on delete. Invoice runs and
    // ended assignments (with no live timesheets) are cleared in the same
    // transaction — invoice_runs has no cascade, so delete it first.
    await prisma.$transaction([
      prisma.invoiceRun.deleteMany({ where: { clientAccountId: id } }),
      prisma.assignment.deleteMany({ where: { clientAccountId: id } }),
      prisma.clientAccount.delete({ where: { id } }),
    ]);
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
