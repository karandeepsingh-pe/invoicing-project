"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/auth/dev-session";
import { orgCreateSchema } from "@/lib/schemas/org";
import type { ActionResult } from "./result";

export async function createOrg(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  await requireAdmin();

  const parsed = orgCreateSchema.safeParse({
    name: formData.get("name"),
    outputTemplate: formData.get("outputTemplate"),
    defaultCurrency: formData.get("defaultCurrency") || undefined,
  });
  if (!parsed.success) {
    return { ok: false, fieldErrors: parsed.error.flatten().fieldErrors };
  }

  try {
    const org = await prisma.org.create({ data: parsed.data });
    revalidatePath("/admin/orgs");
    revalidatePath("/admin/commercials");
    return { ok: true, id: org.id };
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return { ok: false, fieldErrors: { name: ["An org with this name already exists"] } };
    }
    throw err;
  }
}

export async function deleteOrg(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  await requireAdmin();

  const id = String(formData.get("id") ?? "");
  if (!id) {
    return { ok: false, formError: "Missing org id." };
  }

  const org = await prisma.org.findUnique({
    where: { id },
    include: {
      _count: { select: { clientAccounts: true, technicians: true } },
    },
  });
  if (!org) {
    return { ok: false, formError: "Org not found." };
  }

  if (org._count.clientAccounts > 0 || org._count.technicians > 0) {
    const parts: string[] = [];
    if (org._count.clientAccounts > 0) {
      parts.push(`${org._count.clientAccounts} client account(s)`);
    }
    if (org._count.technicians > 0) {
      parts.push(`${org._count.technicians} technician(s)`);
    }
    return {
      ok: false,
      formError: `Cannot delete "${org.name}" — it still has ${parts.join(" and ")}. Remove or reassign them first.`,
    };
  }

  try {
    await prisma.org.delete({ where: { id } });
    revalidatePath("/admin/orgs");
    revalidatePath("/admin/commercials");
    return { ok: true, message: `Deleted "${org.name}".` };
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2003") {
      return {
        ok: false,
        formError:
          "Cannot delete this org because related records still reference it. Remove them first.",
      };
    }
    throw err;
  }
}
