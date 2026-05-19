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
    return { ok: true, id: org.id };
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return { ok: false, fieldErrors: { name: ["An org with this name already exists"] } };
    }
    throw err;
  }
}
